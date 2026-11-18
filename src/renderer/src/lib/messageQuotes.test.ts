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
    // Leading spaces stay: a selection can be code, where the first line's
    // indentation is part of what it means.
    expect(normalizeQuoteText('  first  \r\n\n\n\nsecond\t\n\n')).toBe('  first\n\nsecond');
  });

  it('drops blank lines at either end', () => {
    expect(normalizeQuoteText('\n\nfirst\nsecond\n\n\n')).toBe('first\nsecond');
  });

  it('keeps the first line’s indentation, which a code quote depends on', () => {
    expect(normalizeQuoteText('\n        if ready:\n            return value\n\n')).toBe(
      '        if ready:\n            return value',
    );
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
        'Comments on quotes:',
        '1. > line one',
        '>',
        '> line two',
        'Why this?',
        '2. > single',
        'Rename it.',
        'Also add a test.',
      ].join('\n'),
    );
  });

  it('opens a file quote with its reference, unquoted', () => {
    const message = formatQuotesMessage(
      [
        { id: 'a', reference: '@src/app.ts:30-50', text: '', comment: 'Why?' },
        { id: 'b', reference: '@docs/readme.md', text: 'first\n\nthird', comment: '' },
      ],
      '',
    );
    expect(message).toBe(
      [
        'Comments on quotes:',
        '1. @src/app.ts:30-50',
        'Why?',
        '2. @docs/readme.md',
        '> first',
        '>',
        '> third',
      ].join('\n'),
    );
  });

  it('leaves out an empty comment', () => {
    expect(formatQuotesMessage([{ id: 'a', text: 'only text', comment: ' ' }], ' ')).toBe(
      'Comments on quotes:\n1. > only text',
    );
  });

  it('states one branch above the list when every quote shares it', () => {
    const message = formatQuotesMessage(
      [
        { id: 'a', reference: '@src/app.ts:10-12', text: 'run();', branch: 'feat/x', comment: '' },
        {
          id: 'b',
          reference: '@src/app.ts, diff against origin/main:',
          text: '-old\n+new',
          branch: 'feat/x',
          comment: 'Why?',
        },
      ],
      '',
    );
    expect(message).toBe(
      [
        'Comments on quotes:',
        'On branch feat/x.',
        '1. @src/app.ts:10-12',
        '> run();',
        '2. @src/app.ts, diff against origin/main:',
        '> -old',
        '> +new',
        'Why?',
      ].join('\n'),
    );
  });

  it('keeps the branch on each quote when they were read on different ones', () => {
    const message = formatQuotesMessage(
      [
        { id: 'a', reference: '@src/app.ts:10-12', text: 'run();', branch: 'feat/x', comment: '' },
        { id: 'b', reference: '@src/b.ts:3', text: 'quoted', branch: 'main', comment: '' },
      ],
      '',
    );
    expect(message).toBe(
      [
        'Comments on quotes:',
        '1. on branch feat/x: @src/app.ts:10-12',
        '> run();',
        '2. on branch main: @src/b.ts:3',
        '> quoted',
      ].join('\n'),
    );
  });

  it('names the branch on the quote when another quote has none', () => {
    const message = formatQuotesMessage(
      [
        { id: 'a', reference: '@src/app.ts:1', text: 'a', branch: 'feat/x', comment: '' },
        { id: 'b', text: 'from the chat', comment: '' },
      ],
      '',
    );
    expect(message).toBe(
      'Comments on quotes:\n1. on branch feat/x: @src/app.ts:1\n> a\n2. > from the chat',
    );
  });

  it('sends a global comment alone without the quotes header', () => {
    expect(formatQuotesMessage([], 'Overall fine.')).toBe('Global comment:\nOverall fine.');
  });

  it('puts the global comment last, under its own label', () => {
    expect(formatQuotesMessage([{ id: 'a', text: 'quoted', comment: '' }], ' Overall fine. ')).toBe(
      'Comments on quotes:\n1. > quoted\nGlobal comment:\nOverall fine.',
    );
  });
});
