import { describe, expect, it } from 'vitest';
import { formatFileContentQuote, formatFileLineQuote } from './fileQuotes';

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
});
