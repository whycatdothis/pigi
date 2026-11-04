import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GitDiffFile } from '../../shared/ipcContract';
import {
  getGitCommitFiles,
  getGitDiffFile,
  getGitDiffSummary,
  parseNameStatus,
  parseNumStat,
  parsePorcelainStatus,
  setGitStaged,
} from './gitDiff';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync(
    'git',
    [
      '-c',
      'user.name=Diff Test',
      '-c',
      'user.email=diff@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd },
  );
}

describe('git diff parsers', () => {
  it('keeps the new path of a porcelain rename and skips its old path', () => {
    const statuses = parsePorcelainStatus('R  b.txt\0a.txt\0A  c.txt\0?? d.txt\0');
    expect([...statuses]).toEqual([
      ['b.txt', 'R '],
      ['c.txt', 'A '],
      ['d.txt', '??'],
    ]);
  });

  it('reads old and new paths from a name-status rename', () => {
    expect(parseNameStatus('R100\0a.txt\0b.txt\0A\0c.txt\0')).toEqual([
      { path: 'b.txt', oldPath: 'a.txt', code: 'R100' },
      { path: 'c.txt', oldPath: null, code: 'A' },
    ]);
  });

  it('reads rename stats from the trailing-tab form', () => {
    expect([...parseNumStat('0\t0\t\0a.txt\0b.txt\0' + '1\t0\tc.txt\0')]).toEqual([
      ['b.txt', { additions: 0, deletions: 0, binary: false }],
      ['c.txt', { additions: 1, deletions: 0, binary: false }],
    ]);
  });
});

describe('getGitDiffSummary', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pigi-git-diff-'));
    await git(root, 'init', '-q', '-b', 'main');
    await writeFile(join(root, 'a.txt'), 'one\n');
    await git(root, 'add', 'a.txt');
    await git(root, 'commit', '-qm', 'one');
    await writeFile(join(root, 'a.txt'), 'one\ntwo\n');
    await git(root, 'add', 'a.txt');
    await git(root, 'commit', '-qm', 'two');
    await writeFile(join(root, 'a.txt'), 'one\ntwo\nthree\n');
    await writeFile(join(root, 'new.txt'), 'new\n');
    await writeFile(join(root, 'moved-from.txt'), 'a\nb\nc\nd\ne\n');
    await git(root, 'add', 'moved-from.txt');
    await git(root, 'commit', '-qm', 'three');
    // Moved without `git add`: Git itself reports a deletion and an untracked file.
    await rename(join(root, 'moved-from.txt'), join(root, 'moved-to.txt'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('defaults to the main branch and lists working-tree changes', async () => {
    const result = await getGitDiffSummary(root, { kind: 'branch', base: null });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.summary.branch).toBe('main');
    expect(result.summary.base).toBe('main');
    expect(result.summary.defaultBase).toBe('main');
    expect(result.summary.files.map((file) => [file.path, file.status])).toEqual([
      ['a.txt', 'modified'],
      ['moved-to.txt', 'renamed'],
      ['new.txt', 'untracked'],
    ]);
    expect(result.summary.files[1].oldPath).toBe('moved-from.txt');
    expect(result.summary.files[2].additions).toBe(1);
  });

  it('reads an unstaged move as a rename without touching the real index', async () => {
    const indexBefore = await readFile(join(root, '.git', 'index'));
    const diff = await getGitDiffFile(
      root,
      { kind: 'base', base: 'HEAD' },
      'moved-to.txt',
      'moved-from.txt',
    );
    expect(diff).toMatchObject({ success: true, newContent: 'a\nb\nc\nd\ne\n' });
    if (!diff.success) return;
    expect(diff.patch).toContain('rename from moved-from.txt');
    expect(diff.patch).toContain('rename to moved-to.txt');
    expect(await readFile(join(root, '.git', 'index'))).toEqual(indexBefore);
  });

  it('compares against a commit and reads that file diff', async () => {
    const result = await getGitDiffSummary(root, { kind: 'branch', base: 'HEAD~2' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.summary.commits.map((commit) => commit.subject)).toEqual(['three', 'two']);
    expect(result.summary.baseCommits.map((commit) => commit.subject)).toEqual(['one']);
    expect(result.summary.baseLabel).toMatch(/^[0-9a-f]{7,}$/);

    await git(root, 'tag', 'v1', 'HEAD~2');
    const tagged = await getGitDiffSummary(root, { kind: 'branch', base: 'v1' });
    expect(tagged.success && tagged.summary.baseLabel).toBe('v1');

    const diff = await getGitDiffFile(root, result.summary.source, 'a.txt', null);
    expect(diff.success).toBe(true);
    if (!diff.success) return;
    expect(diff.patch).toContain('+two');
    expect(diff.patch).toContain('+three');
  });

  it('lists only the last commit, read as that commit', async () => {
    const result = await getGitDiffSummary(root, { kind: 'lastCommit' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // The working-tree edit to a.txt and the unstaged move are not part of it.
    expect(result.summary.files.map((file) => [file.path, file.status])).toEqual([
      ['moved-from.txt', 'added'],
    ]);
    expect(result.summary.source).toEqual({ kind: 'commit', commit: result.summary.base });
    expect(result.summary.branches).toEqual([]);
  });

  it('builds a patch for an untracked file', async () => {
    const result = await getGitDiffSummary(root, { kind: 'uncommitted' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const diff = await getGitDiffFile(root, result.summary.source, 'new.txt', null);
    expect(diff).toMatchObject({ success: true });
    if (!diff.success) return;
    expect(diff.patch).toContain('new file mode 100644');
    expect(diff.patch).toContain('+new');
  });

  it('lists and diffs one commit against its parent, including the root commit', async () => {
    const files = await getGitCommitFiles(root, 'HEAD~1');
    expect(files).toMatchObject({ success: true, files: [{ path: 'a.txt', additions: 1 }] });

    const rootCommit = await getGitCommitFiles(root, 'HEAD~2');
    expect(rootCommit).toMatchObject({
      success: true,
      files: [{ path: 'a.txt', status: 'added' }],
    });

    const diff = await getGitDiffFile(root, { kind: 'commit', commit: 'HEAD~1' }, 'a.txt', null);
    expect(diff).toMatchObject({ success: true, newContent: 'one\ntwo\n' });
    if (!diff.success) return;
    expect(diff.patch).toContain('+two');
    expect(diff.patch).not.toContain('+three');
  });
});

describe('a project in a subdirectory of its repository', () => {
  let root: string;
  let project: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pigi-git-diff-sub-'));
    project = join(root, 'app');
    await git(root, 'init', '-q', '-b', 'main');
    await mkdir(join(project, 'src'), { recursive: true });
    await writeFile(join(project, 'src', 'x.txt'), 'one\n');
    await writeFile(join(root, 'outside.txt'), 'one\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'one');
    await writeFile(join(project, 'src', 'x.txt'), 'one\ntwo\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'two');
    await writeFile(join(project, 'src', 'x.txt'), 'one\ntwo\nthree\n');
    await writeFile(join(project, 'new.txt'), 'new\n');
    await writeFile(join(root, 'outside.txt'), 'one\ntwo\n');
    await writeFile(join(root, 'outside-new.txt'), 'new\n');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists only the project, with project-relative paths', async () => {
    const result = await getGitDiffSummary(project, { kind: 'branch', base: 'HEAD~1' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.summary.files.map((file) => [file.path, file.status])).toEqual([
      ['new.txt', 'untracked'],
      ['src/x.txt', 'modified'],
    ]);
  });

  it('reads patches and contents by project-relative path', async () => {
    const working = await getGitDiffFile(
      project,
      { kind: 'base', base: 'HEAD~1' },
      'src/x.txt',
      null,
    );
    expect(working).toMatchObject({ success: true, newContent: 'one\ntwo\nthree\n' });
    if (!working.success) return;
    expect(working.patch).toContain('+three');

    const untracked = await getGitDiffFile(
      project,
      { kind: 'base', base: 'HEAD' },
      'new.txt',
      null,
    );
    expect(untracked).toMatchObject({ success: true });
    if (!untracked.success) return;
    expect(untracked.patch).toContain('+new');

    const commit = await getGitDiffFile(
      project,
      { kind: 'commit', commit: 'HEAD' },
      'src/x.txt',
      null,
    );
    expect(commit).toMatchObject({ success: true, newContent: 'one\ntwo\n' });
    if (!commit.success) return;
    expect(commit.patch).toContain('+two');

    const files = await getGitCommitFiles(project, 'HEAD~1');
    expect(files).toMatchObject({ success: true, files: [{ path: 'src/x.txt' }] });
  });
});

describe('staged and unstaged changes', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pigi-git-diff-staged-'));
    await git(root, 'init', '-q', '-b', 'main');
    await writeFile(join(root, 'both.txt'), 'one\n');
    await writeFile(join(root, 'reverted.txt'), 'one\n');
    await writeFile(join(root, 'staged.txt'), 'one\n');
    await writeFile(join(root, 'unstaged.txt'), 'one\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'one');
    await writeFile(join(root, 'both.txt'), 'one\ntwo\n');
    await writeFile(join(root, 'reverted.txt'), 'one\ntwo\n');
    await writeFile(join(root, 'staged.txt'), 'one\ntwo\n');
    await git(root, 'add', 'both.txt', 'reverted.txt', 'staged.txt');
    await writeFile(join(root, 'both.txt'), 'one\ntwo\nthree\n');
    await writeFile(join(root, 'reverted.txt'), 'one\n');
    await writeFile(join(root, 'unstaged.txt'), 'one\ntwo\n');
    await writeFile(join(root, 'new.txt'), 'new\n');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists the index against HEAD and the working tree against the index', async () => {
    const result = await getGitDiffSummary(root, { kind: 'uncommitted' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const list = (files: GitDiffFile[]): [string, string, number, number][] =>
      files.map((file) => [file.path, file.status, file.additions, file.deletions]);
    // A change staged and then undone in the working tree is in both lists, not in neither.
    expect(list(result.summary.staged)).toEqual([
      ['both.txt', 'modified', 1, 0],
      ['reverted.txt', 'modified', 1, 0],
      ['staged.txt', 'modified', 1, 0],
    ]);
    expect(list(result.summary.unstaged)).toEqual([
      ['both.txt', 'modified', 1, 0],
      ['new.txt', 'untracked', 1, 0],
      ['reverted.txt', 'modified', 0, 1],
      ['unstaged.txt', 'modified', 1, 0],
    ]);
  });

  it('reads each half of a partly staged file, with the matching new content', async () => {
    const staged = await getGitDiffFile(root, { kind: 'staged' }, 'both.txt', null);
    const unstaged = await getGitDiffFile(root, { kind: 'unstaged' }, 'both.txt', null);
    expect(staged).toMatchObject({ success: true, newContent: 'one\ntwo\n' });
    expect(unstaged).toMatchObject({ success: true, newContent: 'one\ntwo\nthree\n' });
    if (!staged.success || !unstaged.success) return;
    expect(staged.patch).toContain('+two');
    expect(staged.patch).not.toContain('+three');
    expect(unstaged.patch).toContain('+three');
    expect(unstaged.patch).not.toContain('+two');
  });

  it('stages everything, untracked files included, and unstages it again', async () => {
    expect(await setGitStaged(root, true)).toEqual({ success: true });
    let result = await getGitDiffSummary(root, { kind: 'uncommitted' });
    if (!result.success) throw new Error(result.error);
    expect(result.summary.unstaged).toEqual([]);
    expect(result.summary.staged.map((file) => file.path)).toEqual([
      'both.txt',
      'new.txt',
      'staged.txt',
      'unstaged.txt',
    ]);

    expect(await setGitStaged(root, false)).toEqual({ success: true });
    result = await getGitDiffSummary(root, { kind: 'uncommitted' });
    if (!result.success) throw new Error(result.error);
    expect(result.summary.staged).toEqual([]);
    expect(result.summary.unstaged.map((file) => file.path)).toEqual([
      'both.txt',
      'new.txt',
      'staged.txt',
      'unstaged.txt',
    ]);
  });
});

describe('long files', () => {
  let root: string;
  const numbered = (count: number, label: string): string =>
    Array.from({ length: count }, (_, index) => `${label} ${index + 1}`).join('\n') + '\n';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pigi-git-diff-long-'));
    await git(root, 'init', '-q', '-b', 'main');
    await writeFile(join(root, 'rewritten.txt'), numbered(3000, 'old'));
    await writeFile(join(root, 'long.txt'), numbered(6000, 'line'));
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'base');
    await writeFile(join(root, 'rewritten.txt'), numbered(3000, 'new'));
    await writeFile(
      join(root, 'long.txt'),
      numbered(6000, 'line').replace('line 3000\n', 'changed\n'),
    );
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('leaves out the new file when the patch is cut, so no gap runs over changes', async () => {
    const diff = await getGitDiffFile(root, { kind: 'base', base: 'HEAD' }, 'rewritten.txt', null);
    expect(diff).toMatchObject({ success: true, truncated: true, newContent: null });
  });

  it('keeps the new file of a long file with a small patch, for expanding gaps', async () => {
    const diff = await getGitDiffFile(root, { kind: 'base', base: 'HEAD' }, 'long.txt', null);
    expect(diff).toMatchObject({ success: true, truncated: false });
    if (!diff.success) return;
    expect(diff.newContent?.split('\n')).toHaveLength(6001);
  });
});
