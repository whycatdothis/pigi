import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import {
  TASK_NAME_PATTERN,
  type TaskDirSource,
  type TaskInfo,
  type TaskUpdate,
} from '../../shared/ipcContract';
import { expandHome } from '../projects/pathCompletion';

// Task state lives in <task>/.pigi/task.json, which is gitignored: every task
// directory is a git repo (plan.md and review docs belong in history), but the
// bookkeeping file does not.
const DEFAULT_TASKS_ROOT = join(homedir(), '.pigi', 'tasks');
const STATE_DIR = '.pigi';
const STATE_FILE = 'task.json';
const AGENTS_FILE = 'AGENTS.md';
const WORKDIRS_START = '<!-- pigi:workdirs:start -->';
const WORKDIRS_END = '<!-- pigi:workdirs:end -->';

/** On-disk task state. `removedDirs` (tombstones) never leaves the main process. */
interface TaskConfig {
  workDirs: string[];
  removedDirs: string[];
  suggestedDirs: string[];
  activeWorkDir: string | null;
  /** Display-name override; absent means the directory name. */
  name?: string;
  hidden?: boolean;
  emoji?: string | null;
}

const emptyConfig = (): TaskConfig => ({
  workDirs: [],
  removedDirs: [],
  suggestedDirs: [],
  activeWorkDir: null,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function normalizeDir(dir: string): string {
  return resolve(expandHome(dir.trim()));
}

const dedupe = (dirs: string[]): string[] => [...new Set(dirs)];

function parseConfig(raw: string): TaskConfig | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const { workDirs, removedDirs, suggestedDirs, activeWorkDir, name, hidden, emoji } = parsed;
    if (
      !isStringList(workDirs) ||
      !isStringList(removedDirs) ||
      !isStringList(suggestedDirs) ||
      !(activeWorkDir === null || typeof activeWorkDir === 'string')
    ) {
      return null;
    }
    const cleanDirs = (dirs: string[]): string[] =>
      dedupe(dirs.map(normalizeDir).filter((dir) => isAbsolute(dir)));
    const cleanWorkDirs = cleanDirs(workDirs);
    const cleanActive = typeof activeWorkDir === 'string' ? normalizeDir(activeWorkDir) : null;
    return {
      workDirs: cleanWorkDirs,
      removedDirs: cleanDirs(removedDirs),
      suggestedDirs: cleanDirs(suggestedDirs).filter((dir) => !cleanWorkDirs.includes(dir)),
      // An active dir that is no longer a work dir has nothing to point at.
      activeWorkDir: cleanActive && cleanWorkDirs.includes(cleanActive) ? cleanActive : null,
      // Optional identity fields: a wrong type drops the field, not the file.
      ...(typeof name === 'string' && TASK_NAME_PATTERN.test(name) ? { name } : {}),
      ...(typeof hidden === 'boolean' ? { hidden } : {}),
      ...(typeof emoji === 'string' || emoji === null ? { emoji } : {}),
    };
  } catch {
    return null;
  }
}

async function readConfig(taskDir: string): Promise<TaskConfig> {
  try {
    const raw = await readFile(join(taskDir, STATE_DIR, STATE_FILE), 'utf8');
    // A corrupt file is rebuilt empty rather than blocking the task list.
    return parseConfig(raw) ?? emptyConfig();
  } catch {
    return emptyConfig();
  }
}

async function writeFileAtomic(file: string, content: string): Promise<void> {
  // Same-directory temp + rename, so a crash mid-write cannot truncate the
  // previous version.
  const temp = join(
    dirname(file),
    `.${basename(file)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  try {
    await writeFile(temp, content, 'utf8');
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function writeConfig(taskDir: string, config: TaskConfig): Promise<void> {
  await mkdir(join(taskDir, STATE_DIR), { recursive: true });
  await writeFileAtomic(
    join(taskDir, STATE_DIR, STATE_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

const workDirsList = (workDirs: string[]): string =>
  workDirs.length === 0
    ? '(none yet — add working directories from the task sidebar)'
    : workDirs.map((dir) => `- ${dir}`).join('\n');

// Only the block between the markers is pigi-managed; everything around it is
// the user's and survives work-dir edits.
export function replaceWorkDirsBlock(current: string, workDirs: string[]): string {
  const block = `${WORKDIRS_START}\n${workDirsList(workDirs)}\n${WORKDIRS_END}`;
  const start = current.indexOf(WORKDIRS_START);
  const end = current.indexOf(WORKDIRS_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${current.slice(0, start)}${block}${current.slice(end + WORKDIRS_END.length)}`;
  }
  if (current === '') return `${block}\n`;
  const trimmed = current.endsWith('\n') ? current : `${current}\n`;
  return `${trimmed}\n${block}\n`;
}

function agentsTemplate(taskName: string): string {
  return [
    `# pigi task: ${taskName}`,
    '',
    `This directory is the home of the pigi task "${taskName}". Sessions here`,
    'work across the working directories listed below.',
    '',
    'Treat each working directory as the project root for anything under it:',
    'cd into it before running project commands, and commit code changes',
    'there, never in this directory. Write plans, reviews, and other task',
    'notes as markdown files in this directory.',
    '',
    replaceWorkDirsBlock('', []),
  ].join('\n');
}

async function syncAgentsFile(
  taskDir: string,
  taskName: string,
  workDirs: string[],
): Promise<void> {
  const file = join(taskDir, AGENTS_FILE);
  let current: string;
  try {
    current = await readFile(file, 'utf8');
  } catch (error) {
    // Only a missing file gets the template; an unreadable one must not be
    // overwritten, losing the user's content.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    current = agentsTemplate(taskName);
  }
  await writeFileAtomic(file, replaceWorkDirsBlock(current, workDirs));
}

const execFileAsync = promisify(execFile);

// Awaited by createTask: returning before git finishes would let a delete
// (or a test's cleanup) race git still writing .git.
async function gitInit(taskDir: string): Promise<void> {
  try {
    await execFileAsync('git', ['init'], { cwd: taskDir });
  } catch (error) {
    // The task still works without history; the file map just loses diffs.
    console.warn(`[tasks] git init failed in ${taskDir}:`, (error as Error).message);
  }
}

async function ensureGitignore(taskDir: string): Promise<void> {
  const file = join(taskDir, '.gitignore');
  let current = '';
  try {
    current = await readFile(file, 'utf8');
  } catch {
    // Missing .gitignore is the common case.
  }
  if (current.split('\n').some((line) => line.trim() === `${STATE_DIR}/`)) return;
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  await writeFile(file, `${current}${separator}${STATE_DIR}/\n`, 'utf8');
}

function toTaskInfo(dirName: string, taskDir: string, config: TaskConfig): TaskInfo {
  return {
    name: config.name ?? dirName,
    path: taskDir,
    workDirs: config.workDirs,
    suggestedDirs: config.suggestedDirs,
    activeWorkDir: config.activeWorkDir,
    hidden: config.hidden ?? false,
    emoji: config.emoji ?? null,
  };
}

/** Every name a task answers to: its directory name and its display override. */
async function takenTaskNames(root: string, excludeDir?: string): Promise<Set<string>> {
  const names = new Set<string>();
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (entry === excludeDir || !TASK_NAME_PATTERN.test(entry)) continue;
    names.add(entry.toLowerCase());
    const config = await readConfig(join(root, entry));
    if (config.name) names.add(config.name.toLowerCase());
  }
  return names;
}

// A task path must name a directory directly inside the tasks root and keep
// its state files inside itself; symlinks are resolved before comparing so a
// symlinked task dir cannot make the CLI write elsewhere.
async function resolveTaskDir(taskPath: string, root: string): Promise<string> {
  const realRoot = await realpath(root).catch(() => resolve(root));
  const realTask = await realpath(taskPath).catch(() => null);
  if (!realTask || dirname(realTask) !== realRoot || !TASK_NAME_PATTERN.test(basename(realTask))) {
    throw new Error(`Not a task directory: ${taskPath}`);
  }
  for (const rel of [STATE_DIR, AGENTS_FILE]) {
    const real: string | null = await realpath(join(realTask, rel)).catch(() => null);
    if (real && (real === realTask || !real.startsWith(realTask + sep))) {
      throw new Error(`Task path escapes the task directory: ${rel}`);
    }
  }
  return realTask;
}

async function statAsDir(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

const isUnder = (dir: string, parent: string): boolean => dir.startsWith(parent + sep);

// Path identity for tombstone and duplicate checks follows symlinks, so a
// dir cannot sneak back under a differently-spelled alias.
async function canonicalDir(dir: string): Promise<string> {
  return realpath(dir).catch(() => dir);
}

async function includesDir(list: string[], dir: string): Promise<boolean> {
  const canonical = await canonicalDir(dir);
  for (const entry of list) {
    if ((await canonicalDir(entry)) === canonical) return true;
  }
  return false;
}

const isGenericDir = (dir: string): boolean => dir === homedir() || dir === sep;

async function prepareAdd(dir: string, taskDir: string): Promise<string> {
  const normalized = normalizeDir(dir);
  if ((await canonicalDir(normalized)) === taskDir) {
    throw new Error('The task directory itself cannot be a working directory.');
  }
  if (isGenericDir(normalized)) {
    throw new Error('The home directory is too generic to be a working directory.');
  }
  if (!(await statAsDir(normalized))) {
    throw new Error(`Directory does not exist: ${normalized}`);
  }
  return normalized;
}

// Adds a dir to a draft config: clears its tombstone, swallows listed
// children, and keeps activeWorkDir pointing at a real work dir.
function addToConfig(config: TaskConfig, dir: string): void {
  config.removedDirs = config.removedDirs.filter((entry) => entry !== dir);
  const swallowed = config.workDirs.filter((entry) => isUnder(entry, dir));
  config.workDirs = config.workDirs.filter((entry) => !isUnder(entry, dir));
  if (!config.workDirs.includes(dir)) config.workDirs.push(dir);
  config.suggestedDirs = config.suggestedDirs.filter(
    (entry) => entry !== dir && !isUnder(entry, dir),
  );
  if (config.activeWorkDir && swallowed.includes(config.activeWorkDir)) {
    config.activeWorkDir = dir;
  }
}

function tombstone(config: TaskConfig, dir: string): void {
  if (!config.removedDirs.includes(dir)) config.removedDirs.push(dir);
}

// updateTask and reportTaskDirs both read-modify-write task.json; chain them
// per task directory so a chip edit and a watcher report cannot interleave
// and lose one side's write.
const updateQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(taskDir: string, run: () => Promise<T>): Promise<T> {
  const next = (updateQueues.get(taskDir) ?? Promise.resolve()).then(run);
  updateQueues.set(
    taskDir,
    next.catch(() => undefined),
  );
  return next;
}

export async function createTask(
  name: string,
  root: string = DEFAULT_TASKS_ROOT,
): Promise<TaskInfo> {
  if (!TASK_NAME_PATTERN.test(name)) {
    throw new Error('Task names cannot contain / or start with a dot (max 64 characters).');
  }
  // Case-insensitive duplicate check: macOS and Windows file systems are.
  // Display-name overrides collide too, or two rows would show the same name.
  if ((await takenTaskNames(root)).has(name.toLowerCase())) {
    throw new Error(`A task named "${name}" already exists.`);
  }
  const taskDir = join(root, name);
  await mkdir(join(taskDir, STATE_DIR), { recursive: true });
  try {
    const config = emptyConfig();
    await writeConfig(taskDir, config);
    await ensureGitignore(taskDir);
    await syncAgentsFile(taskDir, name, config.workDirs);
    await gitInit(taskDir);
    return toTaskInfo(name, taskDir, config);
  } catch (error) {
    await rm(taskDir, { recursive: true, force: true });
    throw error;
  }
}

export async function listTasks(root: string = DEFAULT_TASKS_ROOT): Promise<TaskInfo[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const tasks: { task: TaskInfo; mtime: number }[] = [];
  for (const name of entries) {
    if (!TASK_NAME_PATTERN.test(name)) continue;
    const taskDir = join(root, name);
    // stat (not dirent.isDirectory) so a symlinked task dir lists the same
    // way resolveTaskDir accepts it.
    const info = await stat(taskDir).catch(() => null);
    if (!info?.isDirectory()) continue;
    tasks.push({ task: toTaskInfo(name, taskDir, await readConfig(taskDir)), mtime: info.mtimeMs });
  }
  // Most recently touched first; readdir order is arbitrary across platforms.
  tasks.sort((a, b) => b.mtime - a.mtime);
  return tasks.map((entry) => entry.task);
}

export async function updateTask(
  taskPath: string,
  update: TaskUpdate,
  root: string = DEFAULT_TASKS_ROOT,
): Promise<TaskInfo> {
  const taskDir = await resolveTaskDir(taskPath, root);
  return enqueue(taskDir, async () => {
    const config = await readConfig(taskDir);

    for (const dir of (update.removeWorkDirs ?? []).map(normalizeDir)) {
      tombstone(config, dir);
      config.workDirs = config.workDirs.filter((entry) => entry !== dir);
      config.suggestedDirs = config.suggestedDirs.filter((entry) => entry !== dir);
    }
    for (const dir of (update.ignoreSuggestedDirs ?? []).map(normalizeDir)) {
      tombstone(config, dir);
      config.suggestedDirs = config.suggestedDirs.filter((entry) => entry !== dir);
    }
    for (const dir of update.addWorkDirs ?? []) {
      const normalized = await prepareAdd(dir, taskDir);
      addToConfig(config, normalized);
    }

    if (update.renameTo !== undefined) {
      const name = update.renameTo.trim();
      const dirName = basename(taskDir);
      if (!TASK_NAME_PATTERN.test(name)) {
        throw new Error('Task names cannot contain / or start with a dot (max 64 characters).');
      }
      if (
        name.toLowerCase() !== config.name?.toLowerCase() &&
        name.toLowerCase() !== dirName.toLowerCase() &&
        (await takenTaskNames(root, dirName)).has(name.toLowerCase())
      ) {
        throw new Error(`A task named "${name}" already exists.`);
      }
      // Renaming back to the directory name drops the override.
      if (name === dirName) delete config.name;
      else config.name = name;
    }
    if (update.setHidden !== undefined) {
      if (update.setHidden) config.hidden = true;
      else delete config.hidden;
    }
    if (update.setEmoji !== undefined) {
      if (update.setEmoji === null) delete config.emoji;
      else config.emoji = update.setEmoji;
    }
    if (update.setActiveWorkDir !== undefined) {
      const active = update.setActiveWorkDir;
      if (active !== null && !config.workDirs.includes(normalizeDir(active))) {
        throw new Error('activeWorkDir must be one of the working directories.');
      }
      config.activeWorkDir = active === null ? null : normalizeDir(active);
    }
    if (config.activeWorkDir && !config.workDirs.includes(config.activeWorkDir)) {
      config.activeWorkDir = null;
    }

    await writeConfig(taskDir, config);
    await syncAgentsFile(taskDir, basename(taskDir), config.workDirs);
    return toTaskInfo(basename(taskDir), taskPath, config);
  });
}

export async function reportTaskDirs(
  taskPath: string,
  paths: string[],
  source: TaskDirSource,
  root: string = DEFAULT_TASKS_ROOT,
): Promise<TaskInfo> {
  const taskDir = await resolveTaskDir(taskPath, root);
  return enqueue(taskDir, async () => {
    const config = await readConfig(taskDir);
    let dirsChanged = false;
    let workDirsChanged = false;

    for (const raw of paths) {
      let dir = normalizeDir(raw);
      // A reported file counts as its parent directory.
      const info = await stat(dir).catch(() => null);
      if (!info) continue;
      if (!info.isDirectory()) dir = dirname(dir);
      if (isGenericDir(dir) || (await canonicalDir(dir)) === taskDir) continue;
      if (await includesDir(config.removedDirs, dir)) continue;
      if (await includesDir(config.workDirs, dir)) continue;
      if (config.workDirs.some((workDir) => isUnder(dir, workDir))) continue;

      if (source === 'prompt') {
        addToConfig(config, dir);
        workDirsChanged = true;
      } else {
        if (config.suggestedDirs.includes(dir)) continue;
        config.suggestedDirs.push(dir);
      }
      dirsChanged = true;
    }

    if (dirsChanged) await writeConfig(taskDir, config);
    if (workDirsChanged) await syncAgentsFile(taskDir, basename(taskDir), config.workDirs);
    return toTaskInfo(basename(taskDir), taskPath, config);
  });
}
