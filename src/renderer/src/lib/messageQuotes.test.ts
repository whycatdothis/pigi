import { describe, expect, it } from 'vitest';
import { formatQuotesMessage, normalizeQuoteText } from './messageQuotes';

describe('normalizeQuoteText', () => {
  it('trims line ends and collapses runs of blank lines', () => {
    expect(normalizeQuoteText('  first  \r\n\n\n\nsecond\t\n\n')).toBe('first\n\nsecond');
  });
});

describe('formatQuotesMessage', () => {
  it('numbers each quote, blockquotes its lines and appends the comment', () => {
    const message = formatQuotesMessage([
      { id: 'a', text: 'line one\n\nline two', comment: '  Why this?  ' },
      { id: 'b', text: 'single', comment: 'Rename it.\nAlso add a test.' },
    ]);
    expect(message).toBe(
      [
        'Comments on quoted passages:',
        '',
        '1.',
        '> line one',
        '>',
        '> line two',
        'Why this?',
        '',
        '2.',
        '> single',
        'Rename it.',
        'Also add a test.',
      ].join('\n'),
    );
  });

  it('leaves out an empty comment', () => {
    expect(formatQuotesMessage([{ id: 'a', text: 'only text', comment: ' ' }])).toBe(
      'Comments on quoted passages:\n\n1.\n> only text',
    );
  });
});
