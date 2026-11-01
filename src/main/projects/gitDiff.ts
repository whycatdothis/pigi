import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  GitDiffBranch,
  GitDiffCommit,
  GitDiffFile,
  GitDiffFileResult,
  GitDiffFileStatus,
  GitDiffSummaryResult,
} from '../../shared/ipcContract';
import { readProjectFile, resolveProjectPath } from './projectFiles';

const execFileAsync = promisify(execFile);

const GIT_EXECUTABLE = 'git';
const GIT_TIMEOUT_MS = 6000;
const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const MAX_COMMITS = 100;
const MAX_PATCH_CHARS = 1_500_000;
const MAX_PATCH_LINES = 5000;

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

async function runGit(cwd: string, args: readonly string[]): Promise<GitCommandResult> {
  try {
    const { stdout } = await execFileAsync(GIT_EXECUTABLE, [...args], {
      cwd,
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

  const [nameStatusResult, numStatResult, statusResult, untrackedResult, logResult] =
    await Promise.all([
      runGit(cwd, [
        'diff',
        '--no-ext-diff',
        '--find-renames',
        '--name-status',
        '-z',
        mergeBase,
        '--',
      ]),
      runGit(cwd, ['diff', '--no-ext-diff', '--find-renames', '--numstat', '-z', mergeBase, '--']),
      runGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--']),
      runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--']),
      runGit(cwd, [
        'log',
        `--max-count=${MAX_COMMITS}`,
        '--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI',
        `${mergeBase}..HEAD`,
        '--',
      ]),
    ]);

  if (!nameStatusResult.ok || !numStatResult.ok || !statusResult.ok || !untrackedResult.ok) {
    return { success: false, error: gitError(nameStatusResult.error, 'Unable to read the diff.') };
  }

  const statuses = parsePorcelainStatus(statusResult.stdout);
  const stats = parseNumStat(numStatResult.stdout);
  const files = new Map<string, GitDiffFile>();

  for (const entry of parseNameStatus(nameStatusResult.stdout)) {
    const fileStats = stats.get(entry.path);
    files.set(entry.path, {
      path: entry.path,
      oldPath: entry.oldPath,
      status: normalizeStatus(entry.code),
      workingTreeStatus: statuses.get(entry.path) ?? null,
      additions: fileStats?.additions ?? 0,
      deletions: fileStats?.deletions ?? 0,
      binary: fileStats?.binary ?? false,
    });
  }

  for (const path of untrackedResult.stdout.split('\0')) {
    if (!path || files.has(path)) continue;
    files.set(path, {
      path,
      oldPath: null,
      status: 'untracked',
      workingTreeStatus: '??',
      additions: 0,
      deletions: 0,
      binary: false,
    });
  }

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
      commits: logResult.ok ? parseCommitLog(logResult.stdout) : [],
      files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)),
    },
  };
}

export function createUntrackedPatch(path: string, content: string): string {
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const header = [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
  ];
  if (lines.length === 0) return `${header.join('\n')}\n`;

  const body = lines.map((line) => `+${line}`);
  if (!content.endsWith('\n')) body.push('\\ No newline at end of file');
  return [...header, `@@ -0,0 +1,${lines.length} @@`, ...body].join('\n') + '\n';
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

export async function getGitDiffFile(
  cwd: string,
  base: string,
  path: string,
  oldPath: string | null,
  untracked: boolean,
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

  if (untracked) {
    const file = await readProjectFile(cwd, path);
    if (!file.success) return file;
    const limited = limitPatch(createUntrackedPatch(path, file.content));
    return {
      success: true,
      patch: limited.patch,
      truncated: file.truncated || limited.truncated,
    };
  }

  const baseCommit = await commitFor(cwd, base);
  if (!baseCommit) {
    return { success: false, error: 'That branch or commit no longer exists.' };
  }

  const paths = oldPath && oldPath !== path ? [oldPath, path] : [path];
  const result = await runGit(cwd, [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
    '--unified=3',
    baseCommit,
    '--',
    ...paths,
  ]);
  if (!result.ok) {
    return { success: false, error: gitError(result.error, 'Unable to read this diff.') };
  }

  const limited = limitPatch(result.stdout);
  return { success: true, patch: limited.patch, truncated: limited.truncated };
}
