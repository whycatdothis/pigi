import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import type {
  GitCommitFilesResult,
  GitDiffBranch,
  GitDiffCommit,
  GitDiffFile,
  GitDiffFileResult,
  GitDiffFileStatus,
  GitDiffSource,
  GitDiffSummaryResult,
} from '../../shared/ipcContract';
import { readProjectFile, resolveProjectPath } from './projectFiles';

const execFileAsync = promisify(execFile);

const GIT_EXECUTABLE = 'git';
const GIT_TIMEOUT_MS = 6000;
const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const MAX_BRANCH_COMMITS = 100;
const MAX_BASE_COMMITS = 30;
const MAX_PATCH_CHARS = 1_500_000;
const MAX_PATCH_LINES = 5000;
const MAX_CONTENT_CHARS = 2 * 1024 * 1024;

interface GitCommandResult {
  ok: boolean;
  stdout: string;
  error: string;
}

interface NameStatusEntry {
  path: string;
  oldPath: string | null;
  code: string;
}

interface NumStatEntry {
  additions: number;
  deletions: number;
  binary: boolean;
}

function errorText(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if ('stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
      return error.stderr.trim();
    }
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }
  return '';
}

function gitError(error: string, fallback: string): string {
  if (/not a git repository/i.test(error)) {
    return 'This project is not a Git repository.';
  }
  if (/unknown revision|bad revision|ambiguous argument/i.test(error)) {
    return 'That branch or commit no longer exists.';
  }
  return fallback;
}

async function runGit(
  cwd: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): Promise<GitCommandResult> {
  try {
    const { stdout } = await execFileAsync(GIT_EXECUTABLE, [...args], {
      cwd,
      env,
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      encoding: 'utf8',
    });
    return { ok: true, stdout, error: '' };
  } catch (error) {
    return { ok: false, stdout: '', error: errorText(error) };
  }
}

async function commitFor(cwd: string, ref: string): Promise<string | null> {
  if (!ref || ref.startsWith('-') || ref.includes('\0')) {
    return null;
  }
  const result = await runGit(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return result.ok && result.stdout.trim() ? result.stdout.trim() : null;
}

async function shortHash(cwd: string, commit: string): Promise<string> {
  const result = await runGit(cwd, ['rev-parse', '--short', commit]);
  return result.ok && result.stdout.trim() ? result.stdout.trim() : commit.slice(0, 8);
}

function normalizeStatus(code: string): GitDiffFileStatus {
  switch (code[0]) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'typechanged';
    case 'U':
      return 'conflicted';
    default:
      return 'modified';
  }
}

/** `git status --porcelain=v1 -z`: a rename is followed by its old path. */
export function parsePorcelainStatus(output: string): Map<string, string> {
  const statuses = new Map<string, string>();
  const entries = output.split('\0');
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;
    if (status[0] === 'R' || status[0] === 'C' || status[1] === 'R' || status[1] === 'C') {
      index += 1;
    }
    statuses.set(path, status);
  }
  return statuses;
}

/** `git diff --name-status -z`: `R100\0old\0new\0` for a rename. */
export function parseNameStatus(output: string): NameStatusEntry[] {
  const entries: NameStatusEntry[] = [];
  const tokens = output.split('\0');
  let index = 0;
  while (index < tokens.length) {
    const code = tokens[index];
    index += 1;
    if (!code) continue;
    const firstPath = tokens[index];
    index += 1;
    if (!firstPath) break;
    if (code[0] === 'R' || code[0] === 'C') {
      const secondPath = tokens[index];
      index += 1;
      if (!secondPath) break;
      entries.push({ path: secondPath, oldPath: firstPath, code });
    } else {
      entries.push({ path: firstPath, oldPath: null, code });
    }
  }
  return entries;
}

/** `git diff --numstat -z`: a rename emits `added\tdeleted\t` then old/new tokens. */
export function parseNumStat(output: string): Map<string, NumStatEntry> {
  const stats = new Map<string, NumStatEntry>();
  const tokens = output.split('\0');
  let index = 0;
  while (index < tokens.length) {
    const numbers = tokens[index];
    index += 1;
    if (!numbers) continue;
    const fields = numbers.split('\t');
    const added = fields[0];
    const deleted = fields[1];
    let path: string | undefined;
    if (fields.length === 3 && fields[2] === '') {
      // A rename writes the old path as the next token and the new path after it.
      index += 1;
      path = tokens[index];
      index += 1;
    } else {
      path = fields.slice(2).join('\t');
    }
    if (!path) continue;
    const binary = added === '-' || deleted === '-';
    stats.set(path, {
      additions: binary ? 0 : Number(added) || 0,
      deletions: binary ? 0 : Number(deleted) || 0,
      binary,
    });
  }
  return stats;
}

const COMMIT_LOG_FORMAT = '--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI';

function parseCommitLog(output: string): GitDiffCommit[] {
  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const [hash, shortHashValue, subject, author, date] = line.split('\x1f');
      if (!hash || !shortHashValue) return [];
      return [
        {
          hash,
          shortHash: shortHashValue,
          subject: subject ?? '',
          author: author ?? '',
          date: date ?? '',
        },
      ];
    });
}

/**
 * Runs `task` against a throwaway copy of the index in which the untracked
 * files under `paths` are marked intent-to-add. `git diff <commit>` then sees
 * them as new files: a moved file pairs with its deleted original as a rename,
 * and a new file gets real line counts and a real patch. The real index is
 * never written.
 */
async function withIntentToAdd<T>(
  cwd: string,
  paths: readonly string[],
  task: (env: NodeJS.ProcessEnv | undefined, untracked: Set<string>) => Promise<T>,
): Promise<T> {
  const untrackedResult = await runGit(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    ...paths,
  ]);
  const untracked = new Set(untrackedResult.stdout.split('\0').filter(Boolean));
  const indexResult = await runGit(cwd, ['rev-parse', '--git-path', 'index']);
  const indexPath = indexResult.stdout.trim();
  if (untracked.size === 0 || !indexResult.ok || !indexPath) return task(undefined, untracked);

  const directory = await mkdtemp(join(tmpdir(), 'pigi-git-index-'));
  try {
    const temporaryIndex = join(directory, 'index');
    const pathspecFile = join(directory, 'paths');
    try {
      await copyFile(isAbsolute(indexPath) ? indexPath : join(cwd, indexPath), temporaryIndex);
    } catch {
      // No index to copy (a fresh clone mid-checkout): an empty one would make
      // every tracked file look deleted, so diff without the untracked files.
      return await task(undefined, untracked);
    }
    await writeFile(pathspecFile, [...untracked].join('\0'));
    const env = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
    const added = await runGit(
      cwd,
      ['add', '--intent-to-add', `--pathspec-from-file=${pathspecFile}`, '--pathspec-file-nul'],
      env,
    );
    return await task(added.ok ? env : undefined, untracked);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function changedFiles(
  cwd: string,
  range: readonly string[],
  env: NodeJS.ProcessEnv | undefined,
): Promise<{ ok: true; files: GitDiffFile[] } | { ok: false; error: string }> {
  const flags = ['--no-ext-diff', '--find-renames', '-z'];
  const [nameStatus, numStat] = await Promise.all([
    runGit(cwd, [...range.slice(0, 1), ...flags, '--name-status', ...range.slice(1)], env),
    runGit(cwd, [...range.slice(0, 1), ...flags, '--numstat', ...range.slice(1)], env),
  ]);
  if (!nameStatus.ok || !numStat.ok) {
    return { ok: false, error: nameStatus.error || numStat.error };
  }
  const stats = parseNumStat(numStat.stdout);
  return {
    ok: true,
    files: parseNameStatus(nameStatus.stdout).map((entry) => {
      const fileStats = stats.get(entry.path);
      return {
        path: entry.path,
        oldPath: entry.oldPath,
        status: normalizeStatus(entry.code),
        uncommitted: false,
        additions: fileStats?.additions ?? 0,
        deletions: fileStats?.deletions ?? 0,
        binary: fileStats?.binary ?? false,
      };
    }),
  };
}

async function listBranches(cwd: string, currentBranch: string | null): Promise<GitDiffBranch[]> {
  const result = await runGit(cwd, [
    'for-each-ref',
    '--format=%(refname)',
    'refs/heads',
    'refs/remotes',
  ]);
  if (!result.ok) return [];

  const branches: GitDiffBranch[] = [];
  for (const ref of result.stdout.split('\n')) {
    if (!ref) continue;
    const local = ref.startsWith('refs/heads/');
    const remote = ref.startsWith('refs/remotes/');
    if (!local && !remote) continue;
    const name = ref.slice(local ? 'refs/heads/'.length : 'refs/remotes/'.length);
    if (!name || name === 'HEAD' || name.endsWith('/HEAD')) continue;
    branches.push({ name, current: name === currentBranch, local });
  }

  branches.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    if (left.local !== right.local) return left.local ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  return branches;
}

async function defaultBase(
  cwd: string,
  branch: string | null,
  upstream: string | null,
): Promise<string> {
  const candidates = ['origin/main', 'origin/master', 'main', 'master'];
  if (branch) candidates.push(branch);
  if (upstream) candidates.push(upstream);
  candidates.push('HEAD');

  for (const candidate of [...new Set(candidates)]) {
    if (await commitFor(cwd, candidate)) return candidate;
  }
  return 'HEAD';
}

export async function getGitDiffSummary(
  cwd: string,
  requestedBase?: string | null,
): Promise<GitDiffSummaryResult> {
  if (!cwd || cwd.trim().length === 0) {
    return { success: false, error: 'The project path is missing.' };
  }

  const repository = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok || repository.stdout.trim() !== 'true') {
    return { success: false, error: 'This project is not a Git repository.' };
  }

  const headResult = await runGit(cwd, ['rev-parse', '--verify', 'HEAD']);
  if (!headResult.ok || !headResult.stdout.trim()) {
    return { success: false, error: 'This project has no commits yet.' };
  }
  const head = headResult.stdout.trim();

  const branchResult = await runGit(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branch = branchResult.ok && branchResult.stdout.trim() ? branchResult.stdout.trim() : null;
  const upstreamResult = await runGit(cwd, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  const upstream =
    upstreamResult.ok && upstreamResult.stdout.trim() ? upstreamResult.stdout.trim() : null;

  const branches = await listBranches(cwd, branch);
  const base = requestedBase?.trim() || (await defaultBase(cwd, branch, upstream));
  const baseCommit = await commitFor(cwd, base);
  if (!baseCommit) {
    return { success: false, error: 'That branch or commit no longer exists.' };
  }

  const mergeBaseResult = await runGit(cwd, ['merge-base', baseCommit, head]);
  const mergeBase =
    mergeBaseResult.ok && mergeBaseResult.stdout.trim()
      ? mergeBaseResult.stdout.trim()
      : baseCommit;

  const [changes, statusResult, branchLog, baseLog] = await Promise.all([
    withIntentToAdd(cwd, [], async (env, untracked) => {
      const result = await changedFiles(cwd, ['diff', mergeBase, '--'], env);
      return { result, untracked };
    }),
    runGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--']),
    runGit(cwd, [
      'log',
      `--max-count=${MAX_BRANCH_COMMITS}`,
      COMMIT_LOG_FORMAT,
      `${mergeBase}..HEAD`,
      '--',
    ]),
    runGit(cwd, ['log', `--max-count=${MAX_BASE_COMMITS}`, COMMIT_LOG_FORMAT, mergeBase, '--']),
  ]);

  if (!changes.result.ok || !statusResult.ok) {
    const error = changes.result.ok ? statusResult.error : changes.result.error;
    return { success: false, error: gitError(error, 'Unable to read the diff.') };
  }

  const statuses = parsePorcelainStatus(statusResult.stdout);
  const files = changes.result.files.map((file) => ({
    ...file,
    status: file.status === 'added' && changes.untracked.has(file.path) ? 'untracked' : file.status,
    uncommitted: statuses.has(file.path) || (file.oldPath !== null && statuses.has(file.oldPath)),
  }));

  const baseLabel =
    base === 'HEAD' || branches.some((candidate) => candidate.name === base)
      ? base
      : await shortHash(cwd, baseCommit);

  return {
    success: true,
    summary: {
      branch,
      detached: branch === null,
      base,
      baseLabel,
      mergeBase,
      branches,
      commits: branchLog.ok ? parseCommitLog(branchLog.stdout) : [],
      baseCommits: baseLog.ok ? parseCommitLog(baseLog.stdout) : [],
      files: files.sort((left, right) => left.path.localeCompare(right.path)),
    },
  };
}

function limitPatch(patch: string): { patch: string; truncated: boolean } {
  let limited = patch;
  let truncated = false;
  if (limited.length > MAX_PATCH_CHARS) {
    limited = limited.slice(0, MAX_PATCH_CHARS);
    truncated = true;
  }
  const lines = limited.split('\n');
  if (lines.length > MAX_PATCH_LINES) {
    limited = lines.slice(0, MAX_PATCH_LINES).join('\n');
    truncated = true;
  }
  return { patch: limited, truncated };
}

/** The commit to diff a commit against, or null for a root commit. */
async function firstParent(cwd: string, commit: string): Promise<string | null> {
  return commitFor(cwd, `${commit}^1`);
}

/** `git diff` args for one commit; a root commit diffs against the empty tree. */
function commitRange(commit: string, parent: string | null): string[] {
  return parent
    ? ['diff', parent, commit, '--']
    : ['diff-tree', '-r', '--root', '--no-commit-id', commit, '--'];
}

export async function getGitCommitFiles(cwd: string, ref: string): Promise<GitCommitFilesResult> {
  const commit = await commitFor(cwd, ref);
  if (!commit) {
    return { success: false, error: 'That commit no longer exists.' };
  }
  const result = await changedFiles(
    cwd,
    commitRange(commit, await firstParent(cwd, commit)),
    undefined,
  );
  if (!result.ok) {
    return { success: false, error: gitError(result.error, 'Unable to read this commit.') };
  }
  return { success: true, files: result.files };
}

async function readNewContent(
  cwd: string,
  source: GitDiffSource,
  commit: string,
  path: string,
): Promise<string | null> {
  if (source.kind === 'base') {
    const file = await readProjectFile(cwd, path);
    return file.success && !file.truncated ? file.content : null;
  }
  const result = await runGit(cwd, ['show', `${commit}:${path}`]);
  if (!result.ok || result.stdout.length > MAX_CONTENT_CHARS || result.stdout.includes('\0')) {
    return null;
  }
  return result.stdout;
}

export async function getGitDiffFile(
  cwd: string,
  source: GitDiffSource,
  path: string,
  oldPath: string | null,
): Promise<GitDiffFileResult> {
  if (!cwd || cwd.trim().length === 0 || !path) {
    return { success: false, error: 'The file path is missing.' };
  }
  if (!resolveProjectPath(cwd, path)) {
    return { success: false, error: 'The path is outside the project.' };
  }
  if (oldPath && !resolveProjectPath(cwd, oldPath)) {
    return { success: false, error: 'The path is outside the project.' };
  }

  const commit = await commitFor(cwd, source.kind === 'base' ? source.base : source.commit);
  if (!commit) {
    return { success: false, error: 'That branch or commit no longer exists.' };
  }

  const paths = oldPath && oldPath !== path ? [oldPath, path] : [path];
  const flags = ['--no-color', '--no-ext-diff', '--find-renames', '--unified=3', '-p'];
  const result =
    source.kind === 'base'
      ? await withIntentToAdd(cwd, paths, (env) =>
          runGit(cwd, ['diff', ...flags, commit, '--', ...paths], env),
        )
      : await (async () => {
          const [command, ...range] = commitRange(commit, await firstParent(cwd, commit));
          return runGit(cwd, [command, ...flags, ...range, ...paths]);
        })();
  if (!result.ok) {
    return { success: false, error: gitError(result.error, 'Unable to read this diff.') };
  }

  const deleted = /^deleted file mode /m.test(result.stdout);
  const limited = limitPatch(result.stdout);
  return {
    success: true,
    patch: limited.patch,
    truncated: limited.truncated,
    newContent: deleted ? null : await readNewContent(cwd, source, commit, path),
  };
}
