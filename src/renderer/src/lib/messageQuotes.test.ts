import { describe, expect, it } from 'vitest';
import { formatQuotesMessage, normalizeQuoteText, parseStoredQuotes } from './messageQuotes';

describe('parseStoredQuotes', () => {
  it('keeps well-formed quotes and rejects a session with none left', () => {
    const quote = { id: 'a', text: 'quoted', comment: '' };
    expect(parseStoredQuotes([quote, { id: 'b', text: 'no comment' }, null])).toEqual([quote]);
    expect(parseStoredQuotes([{ id: 3 }])).toBeUndefined();
    expect(parseStoredQuotes('not an array')).toBeUndefined();
  });
});

describe('normalizeQuoteText', () => {
  it('trims line ends and collapses runs of blank lines', () => {
    expect(normalizeQuoteText('  first  \r\n\n\n\nsecond\t\n\n')).toBe('first\n\nsecond');
  });
});

describe('formatQuotesMessage', () => {
  it('numbers each quote, blockquotes its lines and appends the comment', () => {
    const message = formatQuotesMessage(
      [
        { id: 'a', text: 'line one\n\nline two', comment: '  Why this?  ' },
        { id: 'b', text: 'single', comment: 'Rename it.\nAlso add a test.' },
      ],
      '',
    );
    expect(message).toBe(
      [
        'Comments on quoted passages:',
        '1.',
        '> line one',
        '>',
        '> line two',
        'Why this?',
        '2.',
        '> single',
        'Rename it.',
        'Also add a test.',
      ].join('\n'),
    );
  });

  it('leaves out an empty comment', () => {
    expect(formatQuotesMessage([{ id: 'a', text: 'only text', comment: ' ' }], ' ')).toBe(
      'Comments on quoted passages:\n1.\n> only text',
    );
  });

  it('sends a global comment alone without the quotes header', () => {
    expect(formatQuotesMessage([], 'Overall fine.')).toBe('Global comment:\nOverall fine.');
  });

  it('puts the global comment last, under its own label', () => {
    expect(formatQuotesMessage([{ id: 'a', text: 'quoted', comment: '' }], ' Overall fine. ')).toBe(
      'Comments on quoted passages:\n1.\n> quoted\nGlobal comment:\nOverall fine.',
    );
  });
});
