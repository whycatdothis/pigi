import { describe, expect, it } from 'vitest';
import { parseGitPatch } from './gitDiffPatch';

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
    const lines = parseGitPatch(PATCH);
    expect(lines).toEqual([
      { kind: 'hunk', text: '@@ -1,3 +1,4 @@', oldLineNumber: null, newLineNumber: null },
      { kind: 'context', text: 'one', oldLineNumber: 1, newLineNumber: 1 },
      { kind: 'remove', text: 'two', oldLineNumber: 2, newLineNumber: null },
      { kind: 'add', text: 'two!', oldLineNumber: null, newLineNumber: 2 },
      { kind: 'add', text: 'added', oldLineNumber: null, newLineNumber: 3 },
      { kind: 'context', text: 'three', oldLineNumber: 3, newLineNumber: 4 },
      { kind: 'meta', text: 'No newline at end of file', oldLineNumber: null, newLineNumber: null },
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
    expect(lines).toEqual([
      {
        kind: 'meta',
        text: 'Binary files /dev/null and b/logo.png differ',
        oldLineNumber: null,
        newLineNumber: null,
      },
    ]);
  });

  it('starts a second file hunk from its own line numbers', () => {
    const lines = parseGitPatch(
      ['@@ -10 +10 @@', '-old', '@@ -20,2 +20,2 @@', '-old2', '+new2'].join('\n'),
    );
    expect(lines[1]).toMatchObject({ kind: 'remove', oldLineNumber: 10, newLineNumber: null });
    expect(lines[3]).toMatchObject({ kind: 'remove', oldLineNumber: 20, newLineNumber: null });
    expect(lines[4]).toMatchObject({ kind: 'add', newLineNumber: 20, oldLineNumber: null });
  });

  it('returns nothing for an empty patch', () => {
    expect(parseGitPatch('')).toEqual([]);
  });
});
