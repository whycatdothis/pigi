import { describe, expect, it } from 'vitest';
import { buildDiffRows, pairSplitRows, parseGitPatch, splitFileLines } from './gitDiffPatch';

const PATCH = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' one',
  '-two',
  '+two!',
  '+added',
  ' three',
  '\\ No newline at end of file',
].join('\n');

describe('parseGitPatch', () => {
  it('assigns line numbers to added, removed and context rows', () => {
    expect(parseGitPatch(PATCH)).toEqual([
      { kind: 'hunk', text: '', gap: { oldStart: 1, newStart: 1, newEnd: 0 } },
      { kind: 'context', text: 'one', oldLineNumber: 1, newLineNumber: 1 },
      { kind: 'remove', text: 'two', oldLineNumber: 2, newLineNumber: null },
      { kind: 'add', text: 'two!', oldLineNumber: null, newLineNumber: 2 },
      { kind: 'add', text: 'added', oldLineNumber: null, newLineNumber: 3 },
      { kind: 'context', text: 'three', oldLineNumber: 3, newLineNumber: 4 },
      { kind: 'meta', text: 'No newline at end of file' },
      { kind: 'hunk', text: '', gap: { oldStart: 4, newStart: 5, newEnd: null } },
    ]);
  });

  it('skips file headers and keeps binary notices', () => {
    const lines = parseGitPatch(
      [
        'diff --git a/logo.png b/logo.png',
        'index 1111111..2222222 100644',
        'Binary files /dev/null and b/logo.png differ',
      ].join('\n'),
    );
    expect(lines).toEqual([{ kind: 'meta', text: 'Binary files /dev/null and b/logo.png differ' }]);
  });

  it('records the unchanged lines between hunks, including a zero-count side', () => {
    const lines = parseGitPatch(
      ['@@ -10 +10 @@', '-old', '+new', '@@ -20,0 +21,2 @@', '+a', '+b'].join('\n'),
    );
    expect(lines[0]).toMatchObject({ gap: { oldStart: 1, newStart: 1, newEnd: 9 } });
    expect(lines[3]).toMatchObject({ gap: { oldStart: 11, newStart: 11, newEnd: 20 } });
    expect(lines[4]).toMatchObject({ kind: 'add', newLineNumber: 21 });
    expect(lines[6]).toMatchObject({ gap: { oldStart: 21, newStart: 23, newEnd: null } });
  });

  it('returns nothing for an empty patch', () => {
    expect(parseGitPatch('')).toEqual([]);
  });
});

describe('buildDiffRows', () => {
  const patch = ['@@ -3,1 +3,1 @@ fn', '-c', '+C'].join('\n');
  const file = splitFileLines('a\nb\nC\nd\n');

  it('collapses gaps with their size and header', () => {
    const rows = buildDiffRows(parseGitPatch(patch), file, new Set());
    expect(rows.map((row) => row.kind)).toEqual(['gap', 'remove', 'add', 'gap']);
    expect(rows[0]).toMatchObject({ text: 'fn', hiddenLines: 2 });
    expect(rows[3]).toMatchObject({ text: '', hiddenLines: 1 });
  });

  it('expands a gap into numbered context rows', () => {
    const rows = buildDiffRows(parseGitPatch(patch), file, new Set([0]));
    expect(rows.slice(0, 2)).toEqual([
      { kind: 'context', text: 'a', oldLineNumber: 1, newLineNumber: 1 },
      { kind: 'context', text: 'b', oldLineNumber: 2, newLineNumber: 2 },
    ]);
    expect(buildDiffRows(parseGitPatch(patch), file, 'all')).toHaveLength(5);
  });

  it('keeps only the header when the new file is unavailable', () => {
    const rows = buildDiffRows(parseGitPatch(patch), null, 'all');
    expect(rows.map((row) => row.kind)).toEqual(['gap', 'remove', 'add']);
    expect(rows[0]).toMatchObject({ hiddenLines: 0 });
  });
});

describe('pairSplitRows', () => {
  it('faces removed lines with the added lines that replaced them', () => {
    const rows = buildDiffRows(parseGitPatch(PATCH), null, 'all');
    const paired = pairSplitRows(rows).filter((row) => row.kind === 'pair');
    expect(paired.map((row) => [row.left?.text ?? null, row.right?.text ?? null])).toEqual([
      ['one', 'one'],
      ['two', 'two!'],
      [null, 'added'],
      ['three', 'three'],
    ]);
  });
});
