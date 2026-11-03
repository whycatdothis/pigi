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
  GitDiffScope,
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
    // These reads run while an agent may be committing; without this flag
    // `status`/`diff` refresh the index and can take `index.lock` from it.
    const { stdout } = await execFileAsync(GIT_EXECUTABLE, ['--no-optional-locks', ...args], {
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
 * Runs `task` against a throwaway copy of the index in which `untracked` are
 * marked intent-to-add. `git diff <commit>` then sees
 * them as new files: a moved file pairs with its deleted original as a rename,
 * and a new file gets real line counts and a real patch. The real index is
 * never written.
 */
async function withIntentToAdd<T>(
  cwd: string,
  untracked: ReadonlySet<string>,
  task: (env: NodeJS.ProcessEnv | undefined) => Promise<T>,
): Promise<T> {
  if (untracked.size === 0) return task(undefined);
  const indexResult = await runGit(cwd, ['rev-parse', '--git-path', 'index']);
  const indexPath = indexResult.stdout.trim();
  if (!indexResult.ok || !indexPath) return task(undefined);

  const directory = await mkdtemp(join(tmpdir(), 'pigi-git-index-'));
  try {
    const temporaryIndex = join(directory, 'index');
    const pathspecFile = join(directory, 'paths');
    try {
      await copyFile(isAbsolute(indexPath) ? indexPath : join(cwd, indexPath), temporaryIndex);
    } catch {
      // No index to copy (a fresh clone mid-checkout): an empty one would make
      // every tracked file look deleted, so diff without the untracked files.
      return await task(undefined);
    }
    await writeFile(pathspecFile, [...untracked].join('\0'));
    const env = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
    const added = await runGit(
      cwd,
      ['add', '--intent-to-add', `--pathspec-from-file=${pathspecFile}`, '--pathspec-file-nul'],
      env,
    );
    return await task(added.ok ? env : undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function untrackedAmong(cwd: string, paths: readonly string[]): Promise<Set<string>> {
  const result = await runGit(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    ...paths,
  ]);
  return new Set(result.stdout.split('\0').filter(Boolean));
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

/**
 * A monorepo can carry ~90k remote branches; the picker lists the most
 * recently committed ones, and any other can still be typed in.
 */
const MAX_REMOTE_BRANCHES = 200;

function parseBranchRefs(output: string, prefix: string): string[] {
  return output
    .split('\n')
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => ref.slice(prefix.length))
    .filter((name) => name && name !== 'HEAD' && !name.endsWith('/HEAD'));
}

async function listBranches(cwd: string, currentBranch: string | null): Promise<GitDiffBranch[]> {
  const [localResult, remoteResult] = await Promise.all([
    runGit(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads']),
    runGit(cwd, [
      'for-each-ref',
      '--sort=-committerdate',
      `--count=${MAX_REMOTE_BRANCHES}`,
      '--format=%(refname)',
      'refs/remotes',
    ]),
  ]);
  const local = parseBranchRefs(localResult.stdout, 'refs/heads/')
    .map((name) => ({ name, current: name === currentBranch, local: true }))
    .sort((left, right) =>
      left.current !== right.current
        ? left.current
          ? -1
          : 1
        : left.name.localeCompare(right.name),
    );
  const remote = parseBranchRefs(remoteResult.stdout, 'refs/remotes/')
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ name, current: false, local: false }));
  return [...local, ...remote];
}

/**
 * The branch "All changes since" compares against. `origin/HEAD` names the
 * remote's default branch whatever it is called (a monorepo's `trunk`); the
 * usual names cover clones where it was never set.
 */
async function defaultBase(cwd: string): Promise<string> {
  const remoteHead = await runGit(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  const candidates = ['origin/main', 'origin/master', 'main', 'master'];
  if (remoteHead.ok && remoteHead.stdout.startsWith('refs/remotes/')) {
    candidates.unshift(remoteHead.stdout.trim().slice('refs/remotes/'.length));
  }
  for (const candidate of candidates) {
    if (await commitFor(cwd, candidate)) return candidate;
  }
  const upstream = await runGit(cwd, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  return upstream.ok && upstream.stdout.trim() ? upstream.stdout.trim() : 'HEAD';
}

export async function getGitDiffSummary(
  cwd: string,
  scope: GitDiffScope,
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
  const defaultBasePending = defaultBase(cwd);

  if (scope.kind === 'lastCommit') {
    const parent = await firstParent(cwd, head);
    const [changes, baseLabel] = await Promise.all([
      changedFiles(cwd, commitRange(head, parent), undefined),
      shortHash(cwd, head),
    ]);
    if (!changes.ok) {
      return { success: false, error: gitError(changes.error, 'Unable to read the diff.') };
    }
    return {
      success: true,
      summary: {
        branch,
        detached: branch === null,
        base: head,
        baseLabel,
        defaultBase: await defaultBasePending,
        source: { kind: 'commit', commit: head },
        branches: [],
        commits: [],
        baseCommits: [],
        files: changes.files.sort((left, right) => left.path.localeCompare(right.path)),
      },
    };
  }

  // Listing untracked files is the slow part on a big repository (2s on a
  // 170k-file tree), so `status` is the only command that does it, and it
  // starts first so the rest of the summary runs beside it.
  const statusPending = runGit(cwd, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
  ]);

  const branchScope = scope.kind === 'branch';
  const branchesPending = branchScope ? listBranches(cwd, branch) : Promise.resolve([]);
  const base = branchScope ? scope.base?.trim() || (await defaultBasePending) : 'HEAD';
  const baseCommit = await commitFor(cwd, base);
  if (!baseCommit) {
    return { success: false, error: 'That branch or commit no longer exists.' };
  }

  // A branch or tag keeps its name; `HEAD~3` or a SHA shows as the commit it names.
  const labelPending =
    base === 'HEAD'
      ? Promise.resolve(base)
      : runGit(cwd, ['rev-parse', '--symbolic-full-name', base]).then((result) =>
          result.ok && result.stdout.trim() ? base : shortHash(cwd, baseCommit),
        );
  const mergeBaseResult = await runGit(cwd, ['merge-base', baseCommit, head]);
  const mergeBase =
    mergeBaseResult.ok && mergeBaseResult.stdout.trim()
      ? mergeBaseResult.stdout.trim()
      : baseCommit;

  const noLog = Promise.resolve<GitCommandResult>({ ok: true, stdout: '', error: '' });
  // Only the branch scope has a Commits view and a base picker to fill.
  const logs = Promise.all([
    branchScope
      ? runGit(cwd, [
          'log',
          `--max-count=${MAX_BRANCH_COMMITS}`,
          COMMIT_LOG_FORMAT,
          `${mergeBase}..HEAD`,
          '--',
        ])
      : noLog,
    branchScope
      ? runGit(cwd, ['log', `--max-count=${MAX_BASE_COMMITS}`, COMMIT_LOG_FORMAT, mergeBase, '--'])
      : noLog,
  ]);
  const statusResult = await statusPending;
  if (!statusResult.ok) {
    return { success: false, error: gitError(statusResult.error, 'Unable to read the diff.') };
  }
  const statuses = parsePorcelainStatus(statusResult.stdout);
  const untracked = new Set(
    [...statuses].filter(([, status]) => status === '??').map(([path]) => path),
  );
  const changes = await withIntentToAdd(cwd, untracked, (env) =>
    changedFiles(cwd, ['diff', mergeBase, '--'], env),
  );
  const [branchLog, baseLog] = await logs;
  if (!changes.ok) {
    return { success: false, error: gitError(changes.error, 'Unable to read the diff.') };
  }

  const files = changes.files.map((file) => ({
    ...file,
    status: file.status === 'added' && untracked.has(file.path) ? 'untracked' : file.status,
    uncommitted: statuses.has(file.path) || (file.oldPath !== null && statuses.has(file.oldPath)),
  }));

  const [branches, baseLabel, defaultBaseName] = await Promise.all([
    branchesPending,
    labelPending,
    defaultBasePending,
  ]);

  return {
    success: true,
    summary: {
      branch,
      detached: branch === null,
      base,
      baseLabel,
      defaultBase: defaultBaseName,
      source: { kind: 'base', base: mergeBase },
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
      ? await withIntentToAdd(cwd, await untrackedAmong(cwd, paths), (env) =>
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
