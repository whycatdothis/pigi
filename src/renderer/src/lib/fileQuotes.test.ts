import { describe, expect, it } from 'vitest';
import { formatFileContentQuote, formatFileDiffQuote, formatFileLineQuote } from './fileQuotes';

describe('formatFileLineQuote', () => {
  it('quotes a single source line', () => {
    expect(formatFileLineQuote('src/app.ts', 30, 30)).toBe('@src/app.ts:L30');
  });

  it('quotes a line range', () => {
    expect(formatFileLineQuote('src/service/test.js', 30, 50)).toBe('@src/service/test.js:L30-L50');
  });

  it('orders a selection made bottom-up', () => {
    expect(formatFileLineQuote('src/app.ts', 50, 30)).toBe('@src/app.ts:L30-L50');
  });

  it('quotes paths with spaces without breaking the reference', () => {
    expect(formatFileLineQuote('docs/my notes.md', 3, 5)).toBe('@"docs/my notes.md":L3-L5');
  });
});

describe('formatFileContentQuote', () => {
  it('quotes one rendered passage', () => {
    expect(formatFileContentQuote('docs/readme.md', 'Hello there')).toBe(
      '@docs/readme.md > Hello there',
    );
  });

  it('continues a multiline passage with quote markers', () => {
    expect(formatFileContentQuote('docs/readme.md', 'first\n\nthird')).toBe(
      '@docs/readme.md > first\n>\n> third',
    );
  });

  it('quotes markdown paths with spaces', () => {
    expect(formatFileContentQuote('docs/my notes.md', 'Hello')).toBe('@"docs/my notes.md" > Hello');
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
    ).toBe(
      [
        '@src/app.ts, diff against origin/main:',
        '-const timeout = 5000;',
        '+const timeout = 8000;',
        ' retry(fetchUser);',
      ].join('\n'),
    );
  });
});
