import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createUntrackedPatch,
  getGitDiffFile,
  getGitDiffSummary,
  parseNameStatus,
  parseNumStat,
  parsePorcelainStatus,
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

  it('builds a new-file patch and marks a missing final newline', () => {
    const patch = createUntrackedPatch('notes/new file.txt', 'one\ntwo');
    expect(patch).toContain('+++ b/notes/new file.txt');
    expect(patch).toContain('@@ -0,0 +1,2 @@');
    expect(patch).toContain('+one\n+two\n\\ No newline at end of file');
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
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('defaults to the current branch and lists working-tree changes', async () => {
    const result = await getGitDiffSummary(root);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.summary.branch).toBe('main');
    expect(result.summary.base).toBe('main');
    expect(result.summary.files.map((file) => [file.path, file.status])).toEqual([
      ['a.txt', 'modified'],
      ['new.txt', 'untracked'],
    ]);
    expect(result.summary.files[0].workingTreeStatus).toBe(' M');
  });

  it('compares against a commit and reads that file diff', async () => {
    const result = await getGitDiffSummary(root, 'HEAD~1');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.summary.commits.map((commit) => commit.subject)).toEqual(['two']);
    expect(result.summary.files.map((file) => file.path)).toEqual(['a.txt', 'new.txt']);

    const diff = await getGitDiffFile(root, result.summary.mergeBase, 'a.txt', null, false);
    expect(diff.success).toBe(true);
    if (!diff.success) return;
    expect(diff.patch).toContain('+two');
    expect(diff.patch).toContain('+three');
  });

  it('builds a patch for an untracked file', async () => {
    const result = await getGitDiffSummary(root, 'HEAD');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const diff = await getGitDiffFile(root, result.summary.mergeBase, 'new.txt', null, true);
    expect(diff).toMatchObject({ success: true });
    if (!diff.success) return;
    expect(diff.patch).toContain('new file mode 100644');
    expect(diff.patch).toContain('+new');
  });
});
