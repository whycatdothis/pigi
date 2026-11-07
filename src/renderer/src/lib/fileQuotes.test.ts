import { describe, expect, it } from 'vitest';
import { formatFileContentQuote, formatFileDiffQuote, formatFileLineQuote } from './fileQuotes';

describe('formatFileLineQuote', () => {
  it('quotes a single source line', () => {
    expect(formatFileLineQuote('src/app.ts', 30, 30)).toEqual({
      reference: '@src/app.ts:30',
      text: '',
    });
  });

  it('quotes a line range', () => {
    expect(formatFileLineQuote('src/service/test.js', 30, 50).reference).toBe(
      '@src/service/test.js:30-50',
    );
  });

  it('orders a selection made bottom-up', () => {
    expect(formatFileLineQuote('src/app.ts', 50, 30).reference).toBe('@src/app.ts:30-50');
  });

  it('quotes paths with spaces without breaking the reference', () => {
    expect(formatFileLineQuote('docs/my notes.md', 3, 5).reference).toBe('@"docs/my notes.md":3-5');
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
