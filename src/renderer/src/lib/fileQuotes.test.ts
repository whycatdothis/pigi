import { describe, expect, it } from 'vitest';
import {
  diffQuoteBranch,
  formatFileContentQuote,
  formatFileDiffQuote,
  formatFileLineQuote,
  formatFileScopeQuote,
  projectQuotePath,
  withQuoteBranch,
} from './fileQuotes';

describe('formatFileLineQuote', () => {
  it('quotes a single source line with the text it holds', () => {
    expect(formatFileLineQuote('src/app.ts', 30, 30, 'export const app = start();')).toEqual({
      reference: '@src/app.ts:30',
      text: 'export const app = start();',
    });
  });

  it('quotes a line range', () => {
    expect(formatFileLineQuote('src/service/test.js', 30, 50, 'run();').reference).toBe(
      '@src/service/test.js:30-50',
    );
  });

  it('orders a selection made bottom-up', () => {
    expect(formatFileLineQuote('src/app.ts', 50, 30, 'run();').reference).toBe('@src/app.ts:30-50');
  });

  it('quotes paths with spaces without breaking the reference', () => {
    expect(formatFileLineQuote('docs/my notes.md', 3, 5, 'notes').reference).toBe(
      '@"docs/my notes.md":3-5',
    );
  });
});

describe('formatFileContentQuote', () => {
  it('keeps the rendered text under the file reference', () => {
    expect(formatFileContentQuote('docs/my notes.md', 'first\n\nthird')).toEqual({
      reference: '@"docs/my notes.md"',
      text: 'first\n\nthird',
    });
  });
});

describe('formatFileDiffQuote', () => {
  it('quotes lines as a unified diff under what they were compared with', () => {
    expect(
      formatFileDiffQuote('src/app.ts', 'diff against origin/main', [
        { kind: 'remove', text: 'const timeout = 5000;' },
        { kind: 'add', text: 'const timeout = 8000;' },
        { kind: 'context', text: 'retry(fetchUser);' },
      ]),
    ).toEqual({
      reference: '@src/app.ts, diff against origin/main:',
      text: ['-const timeout = 5000;', '+const timeout = 8000;', ' retry(fetchUser);'].join('\n'),
    });
  });
});

describe('withQuoteBranch', () => {
  it('keeps the branch the diff was read on apart from the reference', () => {
    expect(
      withQuoteBranch({ reference: '@src/app.ts, unstaged diff:', text: '+a' }, 'feat/x'),
    ).toEqual({
      reference: '@src/app.ts, unstaged diff:',
      text: '+a',
      branch: 'feat/x',
    });
  });

  it('leaves a quote alone when the branch is unknown', () => {
    const quote = { reference: '@src/app.ts:10-20', text: 'run();' };
    expect(withQuoteBranch(quote, null)).toBe(quote);
  });
});

describe('diffQuoteBranch', () => {
  it('names the branch a working-tree or branch diff was read on', () => {
    expect(diffQuoteBranch('unstaged', 'feat/x')).toBe('feat/x');
    expect(diffQuoteBranch('staged', 'feat/x')).toBe('feat/x');
    expect(diffQuoteBranch('base', 'feat/x')).toBe('feat/x');
  });

  it('names no branch for a commit, which may live on the base', () => {
    expect(diffQuoteBranch('commit', 'feat/x')).toBeNull();
  });

  it('names no branch when the checkout is detached', () => {
    expect(diffQuoteBranch('unstaged', null)).toBeNull();
  });
});

describe('formatFileScopeQuote', () => {
  it('points at the whole file diff without quoting any text', () => {
    expect(formatFileScopeQuote('docs/my notes.md', 'diff in commit abc1234')).toEqual({
      reference: '@"docs/my notes.md", diff in commit abc1234',
      text: '',
    });
  });
});

describe('projectQuotePath', () => {
  it('keeps a file relative inside the session project and absolute in another', () => {
    expect(projectQuotePath('/repo', '/repo', 'src/a.ts')).toBe('src/a.ts');
    expect(projectQuotePath('/other', '/repo', 'src/a.ts')).toBe('/other/src/a.ts');
    expect(projectQuotePath('/other', null, 'src/a.ts')).toBe('src/a.ts');
  });
});
