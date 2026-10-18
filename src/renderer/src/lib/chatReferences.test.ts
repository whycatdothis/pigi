import { describe, expect, it } from 'vitest';
import {
  buildChatReferenceSegments,
  findChatReferences,
  findFileMentionContext,
  formatFileReference,
} from './chatReferences';

const commands = new Set(['skill:review', 'plannotator-review', 'skill:animate']);

describe('findChatReferences', () => {
  it('finds a leading skill invocation', () => {
    expect(findChatReferences('/skill:review check this', commands)).toEqual([
      { kind: 'skill', start: 0, end: 13, value: '/skill:review' },
    ]);
  });

  it('finds extension commands from the same list', () => {
    expect(findChatReferences('/plannotator-review ', commands)).toEqual([
      { kind: 'skill', start: 0, end: 19, value: '/plannotator-review' },
    ]);
  });

  it('ignores unknown commands and commands that are not leading', () => {
    expect(findChatReferences('/compact', commands)).toEqual([]);
    expect(findChatReferences('use /skill:review here', commands)).toEqual([]);
  });

  it('finds file references at word boundaries', () => {
    const text = 'compare @src/main.ts and (@package.json).';
    expect(findChatReferences(text, commands)).toEqual([
      { kind: 'file', start: 8, end: 20, value: '@src/main.ts' },
      { kind: 'file', start: 26, end: 39, value: '@package.json' },
    ]);
  });

  it('keeps quoted paths with spaces together', () => {
    const text = 'look at @"my docs/read me.md" please';
    expect(findChatReferences(text, commands)).toEqual([
      { kind: 'file', start: 8, end: 29, value: '@"my docs/read me.md"' },
    ]);
  });

  it('does not treat email addresses as file references', () => {
    expect(findChatReferences('mail me@example.com', commands)).toEqual([]);
  });

  it('keeps a leading command and a file reference in order', () => {
    const text = '/skill:review @src/main.ts';
    expect(findChatReferences(text, commands)).toEqual([
      { kind: 'skill', start: 0, end: 13, value: '/skill:review' },
      { kind: 'file', start: 14, end: 26, value: '@src/main.ts' },
    ]);
  });
});

describe('buildChatReferenceSegments', () => {
  it('splits plain text around references', () => {
    const text = 'see @src/a.ts now';
    const references = findChatReferences(text, commands);
    expect(buildChatReferenceSegments(text, references)).toEqual([
      { start: 0, end: 4, reference: null },
      { start: 4, end: 13, reference: references[0] },
      { start: 13, end: 17, reference: null },
    ]);
  });

  it('handles reference-only text', () => {
    const text = '@a.ts';
    expect(buildChatReferenceSegments(text, findChatReferences(text, commands))).toEqual([
      { start: 0, end: 5, reference: findChatReferences(text, commands)[0] },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(buildChatReferenceSegments('', [])).toEqual([]);
  });
});

describe('findFileMentionContext', () => {
  it('finds an @ mention at the caret', () => {
    expect(findFileMentionContext('look at @src/ma', 15)).toEqual({
      start: 8,
      query: 'src/ma',
    });
  });

  it('opens for an empty query right after @', () => {
    expect(findFileMentionContext('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('does not open inside a word', () => {
    expect(findFileMentionContext('me@example', 10)).toBeNull();
  });

  it('closes after whitespace', () => {
    expect(findFileMentionContext('@src/a.ts ', 10)).toBeNull();
  });

  it('allows a mention after an opening parenthesis', () => {
    expect(findFileMentionContext('(@src', 5)).toEqual({ start: 1, query: 'src' });
  });
});

describe('formatFileReference', () => {
  it('prefixes plain paths', () => {
    expect(formatFileReference('src/main.ts')).toBe('@src/main.ts ');
  });

  it('quotes paths with spaces', () => {
    expect(formatFileReference('my docs/read me.md')).toBe('@"my docs/read me.md" ');
  });
});
