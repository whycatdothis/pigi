import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import {
  MAX_DIFF_LINES,
  type GitBranchListResult,
  type GitCommitFilesResult,
  type GitDiffBranch,
  type GitDiffCommit,
  type GitDiffFile,
  type GitDiffFileResult,
  type GitDiffFileStatus,
  type GitDiffScope,
  type GitDiffSource,
  type GitDiffSummary,
  type GitDiffSummaryResult,
  type GitStageResult,
} from '../../shared/ipcContract';
import { readProjectFile, resolveProjectPath } from './projectFiles';

const execFileAsync = promisify(execFile);

const GIT_EXECUTABLE = 'git';
const GIT_TIMEOUT_MS = 6000;
const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const MAX_BRANCH_COMMITS = 100;
const MAX_BASE_COMMITS = 30;
const MAX_PATCH_CHARS = 1_500_000;
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
    // suppressBlankEmpty would print an empty context line as "" instead of
    // " ", which the patch parser reads as the end of the hunk.
    const { stdout } = await execFileAsync(
      GIT_EXECUTABLE,
      ['--no-optional-locks', '-c', 'diff.suppressBlankEmpty=false', ...args],
      {
        cwd,
        env,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        encoding: 'utf8',
      },
    );
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

type ChangedFiles = { ok: true; files: GitDiffFile[] } | { ok: false; error: string };

async function changedFiles(
  cwd: string,
  range: readonly string[],
  env: NodeJS.ProcessEnv | undefined,
): Promise<ChangedFiles> {
  const flags = ['--no-ext-diff', '--find-renames', '--relative', '-z'];
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
        additions: fileStats?.additions ?? 0,
        deletions: fileStats?.deletions ?? 0,
        binary: fileStats?.binary ?? false,
      };
    }),
  };
}

/**
 * A large repository can carry tens of thousands of remote branches; the
 * picker lists the most recently committed ones, and any other can still be
 * typed in.
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
 * The base picker's branches, read when it opens rather than with every
 * summary: sorting the remote ones by commit date reads every branch's tip
 * commit, which grows with the branch count.
 */
export async function listGitBranches(cwd: string): Promise<GitBranchListResult> {
  if (!cwd || cwd.trim().length === 0) {
    return { success: false, error: 'The project path is missing.' };
  }
  const branchResult = await runGit(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const current = branchResult.ok && branchResult.stdout.trim() ? branchResult.stdout.trim() : null;
  return { success: true, branches: await listBranches(cwd, current) };
}

/**
 * The branch "All changes since" compares against. `origin/HEAD` names the
 * remote's default branch whatever it is called (`trunk`, `develop`); the
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
  const summaryOf = (
    fields: Omit<GitDiffSummary, 'branch' | 'detached'>,
  ): GitDiffSummaryResult => ({
    success: true,
    summary: { branch, detached: branch === null, ...fields },
  });

  // Listing untracked files walks the whole tree and is the slow part on a
  // big repository. `ls-files` lists them without the extra pass over tracked
  // files `status` makes, starts first so the rest runs beside it, and prints
  // paths relative to the project like `--relative`.
  if (scope.kind === 'status') {
    const untrackedPending = untrackedAmong(cwd, ['.']);
    // Each list is its own diff, so a partly staged file shows each half.
    const stagedPending = changedFiles(cwd, ['diff', '--cached', head, '--'], undefined);
    const untracked = await untrackedPending;
    const unstaged = await withIntentToAdd(cwd, untracked, (env) =>
      changedFiles(cwd, ['diff', '--'], env),
    );
    const staged = await stagedPending;
    if (!staged.ok) {
      return { success: false, error: gitError(staged.error, 'Unable to read the diff.') };
    }
    if (!unstaged.ok) {
      return { success: false, error: gitError(unstaged.error, 'Unable to read the diff.') };
    }
    return summaryOf({
      base: 'HEAD',
      baseLabel: 'HEAD',
      defaultBase: null,
      source: { kind: 'base', base: head },
      commits: [],
      moreCommits: false,
      baseCommits: [],
      files: [],
      staged: sortedFiles(staged.files),
      unstaged: listedUntracked(unstaged.files, untracked),
    });
  }

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
    return summaryOf({
      base: head,
      baseLabel,
      defaultBase: await defaultBasePending,
      source: { kind: 'commit', commit: head },
      commits: [],
      moreCommits: false,
      baseCommits: [],
      files: sortedFiles(changes.files),
      staged: [],
      unstaged: [],
    });
  }

  const untrackedPending = untrackedAmong(cwd, ['.']);
  let base = 'HEAD';
  let baseLabel: string | Promise<string> = 'HEAD';
  let mergeBase = head;
  const noLog = Promise.resolve<GitCommandResult>({ ok: true, stdout: '', error: '' });
  let logs = Promise.all([noLog, noLog]);
  if (scope.kind === 'branch') {
    base = scope.base?.trim() || (await defaultBasePending);
    const baseCommit = await commitFor(cwd, base);
    if (!baseCommit) {
      return { success: false, error: 'That branch or commit no longer exists.' };
    }
    // A branch or tag keeps its name; `HEAD~3` or a SHA shows as the commit it names.
    const named = base;
    baseLabel = runGit(cwd, ['rev-parse', '--symbolic-full-name', named]).then((result) =>
      result.ok && result.stdout.trim() ? named : shortHash(cwd, baseCommit),
    );
    const mergeBaseResult = await runGit(cwd, ['merge-base', baseCommit, head]);
    mergeBase =
      mergeBaseResult.ok && mergeBaseResult.stdout.trim()
        ? mergeBaseResult.stdout.trim()
        : baseCommit;
    // Only the branch scope has a Commits view and a base picker to fill.
    logs = Promise.all([
      runGit(cwd, [
        'log',
        `--max-count=${MAX_BRANCH_COMMITS + 1}`,
        COMMIT_LOG_FORMAT,
        `${mergeBase}..HEAD`,
        '--',
        '.',
      ]),
      runGit(cwd, [
        'log',
        `--max-count=${MAX_BASE_COMMITS}`,
        COMMIT_LOG_FORMAT,
        mergeBase,
        '--',
        '.',
      ]),
    ]);
  }

  const untracked = await untrackedPending;
  const changes = await withIntentToAdd(cwd, untracked, (env) =>
    changedFiles(cwd, ['diff', mergeBase, '--'], env),
  );
  const [branchLog, baseLog] = await logs;
  if (!changes.ok) {
    return { success: false, error: gitError(changes.error, 'Unable to read the diff.') };
  }
  const branchCommits = branchLog.ok ? parseCommitLog(branchLog.stdout) : [];

  return summaryOf({
    base,
    baseLabel: await baseLabel,
    defaultBase: await defaultBasePending,
    source: { kind: 'base', base: mergeBase },
    commits: branchCommits.slice(0, MAX_BRANCH_COMMITS),
    moreCommits: branchCommits.length > MAX_BRANCH_COMMITS,
    baseCommits: baseLog.ok ? parseCommitLog(baseLog.stdout) : [],
    files: listedUntracked(changes.files, untracked),
    staged: [],
    unstaged: [],
  });
}

/** Sorted, with the files intent-to-add made look added marked as untracked. */
function listedUntracked(files: GitDiffFile[], untracked: ReadonlySet<string>): GitDiffFile[] {
  return sortedFiles(
    files.map((file) =>
      file.status === 'added' && untracked.has(file.path) ? { ...file, status: 'untracked' } : file,
    ),
  );
}

function sortedFiles(files: GitDiffFile[]): GitDiffFile[] {
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function limitPatch(patch: string): { patch: string; truncated: boolean } {
  let limited = patch;
  let truncated = false;
  if (limited.length > MAX_PATCH_CHARS) {
    limited = limited.slice(0, MAX_PATCH_CHARS);
    truncated = true;
  }
  const lines = limited.split('\n');
  if (lines.length > MAX_DIFF_LINES) {
    limited = lines.slice(0, MAX_DIFF_LINES).join('\n');
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

/** The file after the change, for expanding gaps and the whole-file view. */
async function readNewContent(
  cwd: string,
  revision: string | null,
  path: string,
): Promise<string | null> {
  if (revision === null) {
    const file = await readProjectFile(cwd, path);
    return file.success && !file.truncated ? file.content : null;
  } else {
    // `./` makes Git resolve the path against the project, not the repository root;
    // an empty revision (`:./path`) reads the index.
    const result = await runGit(cwd, ['show', `${revision}:./${path}`]);
    if (!result.ok || result.stdout.length > MAX_CONTENT_CHARS || result.stdout.includes('\0')) {
      return null;
    }
    return result.stdout;
  }
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

  const ref =
    source.kind === 'base' ? source.base : source.kind === 'commit' ? source.commit : 'HEAD';
  const commit = await commitFor(cwd, ref);
  if (!commit) {
    return { success: false, error: 'That branch or commit no longer exists.' };
  }

  const paths = oldPath && oldPath !== path ? [oldPath, path] : [path];
  const flags = [
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
    '--relative',
    '--unified=3',
    '-p',
  ];
  const againstWorkingTree = async (range: string[]): Promise<GitCommandResult> =>
    withIntentToAdd(cwd, await untrackedAmong(cwd, paths), (env) =>
      runGit(cwd, ['diff', ...flags, ...range, '--', ...paths], env),
    );
  let result: GitCommandResult;
  if (source.kind === 'base') {
    result = await againstWorkingTree([commit]);
  } else if (source.kind === 'unstaged') {
    result = await againstWorkingTree([]);
  } else if (source.kind === 'staged') {
    result = await runGit(cwd, ['diff', ...flags, '--cached', commit, '--', ...paths]);
  } else {
    const [command, ...range] = commitRange(commit, await firstParent(cwd, commit));
    result = await runGit(cwd, [command, ...flags, ...range, ...paths]);
  }
  if (!result.ok) {
    return { success: false, error: gitError(result.error, 'Unable to read this diff.') };
  }

  const deleted = /^deleted file mode /m.test(result.stdout);
  const limited = limitPatch(result.stdout);
  return {
    success: true,
    patch: limited.patch,
    truncated: limited.truncated,
    newContent:
      deleted || limited.truncated
        ? null
        : await readNewContent(cwd, newRevision(source, commit), path),
  };
}

/** Where the file after the change lives: the working tree (null), the index (''), or a commit. */
function newRevision(source: GitDiffSource, commit: string): string | null {
  switch (source.kind) {
    case 'base':
    case 'unstaged':
      return null;
    case 'staged':
      return '';
    case 'commit':
      return commit;
  }
}

/**
 * Stages every change in the project (untracked files included), or takes
 * every staged change back out of the index. `.` keeps a project in a
 * subdirectory from touching the rest of its repository.
 */
export async function setGitStaged(cwd: string, staged: boolean): Promise<GitStageResult> {
  if (!cwd || cwd.trim().length === 0) {
    return { success: false, error: 'The project path is missing.' };
  }
  const result = await runGit(
    cwd,
    staged ? ['add', '--all', '--', '.'] : ['restore', '--staged', '--', '.'],
  );
  if (!result.ok) {
    // Git's own first line names the cause, such as another process holding `index.lock`.
    const cause = result.error.split('\n')[0].replace(/^(fatal|error): /, '');
    const action = staged ? 'Unable to stage the changes' : 'Unable to unstage the changes';
    return { success: false, error: cause ? `${action}: ${cause}` : `${action}.` };
  }
  return { success: true };
}
