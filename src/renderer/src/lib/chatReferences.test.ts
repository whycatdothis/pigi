import { describe, expect, it } from 'vitest';
import { findChatReferences, formatFileReference } from './chatReferences';

const commands = new Set(['skill:review', 'plannotator-review', 'skill:animate']);

describe('findChatReferences', () => {
  it('finds a leading skill invocation', () => {
    expect(findChatReferences('/skill:review check this', commands)).toEqual([
      { kind: 'skill', start: 0, end: 13, value: '/skill:review', id: 'skill:review' },
    ]);
  });

  it('finds extension commands from the same list', () => {
    expect(findChatReferences('/plannotator-review ', commands)).toEqual([
      {
        kind: 'skill',
        start: 0,
        end: 19,
        value: '/plannotator-review',
        id: 'plannotator-review',
      },
    ]);
  });

  it('skips file references when asked, keeping the leading command', () => {
    expect(
      findChatReferences('/skill:review npm i @types/node', commands, { fileReferences: false }),
    ).toEqual([{ kind: 'skill', start: 0, end: 13, value: '/skill:review', id: 'skill:review' }]);
  });

  it('ignores unknown commands and commands that are not leading', () => {
    expect(findChatReferences('/compact', commands)).toEqual([]);
    expect(findChatReferences('use /skill:review here', commands)).toEqual([]);
  });

  it('finds file references at word boundaries', () => {
    const text = 'compare @src/main.ts and (@package.json).';
    expect(findChatReferences(text, commands)).toEqual([
      { kind: 'file', start: 8, end: 20, value: '@src/main.ts', id: 'src/main.ts' },
      { kind: 'file', start: 26, end: 39, value: '@package.json', id: 'package.json' },
    ]);
  });

  it('keeps quoted paths with spaces together', () => {
    const text = 'look at @"my docs/read me.md" please';
    expect(findChatReferences(text, commands)).toEqual([
      {
        kind: 'file',
        start: 8,
        end: 29,
        value: '@"my docs/read me.md"',
        id: 'my docs/read me.md',
      },
    ]);
  });

  it('does not treat email addresses as file references', () => {
    expect(findChatReferences('mail me@example.com', commands)).toEqual([]);
  });

  it('keeps a leading command and a file reference in order', () => {
    const text = '/skill:review @src/main.ts';
    expect(findChatReferences(text, commands)).toEqual([
      { kind: 'skill', start: 0, end: 13, value: '/skill:review', id: 'skill:review' },
      { kind: 'file', start: 14, end: 26, value: '@src/main.ts', id: 'src/main.ts' },
    ]);
  });
});

describe('formatFileReference', () => {
  it('prefixes plain paths', () => {
    expect(formatFileReference('src/main.ts')).toBe('@src/main.ts');
  });

  it('quotes paths with spaces', () => {
    expect(formatFileReference('my docs/read me.md')).toBe('@"my docs/read me.md"');
  });
});
