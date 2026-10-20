import { describe, expect, it } from 'vitest';
import {
  composerDocumentFromText,
  inlineContentFromText,
  serializeReference,
} from './composerContent';

const commands = new Set(['skill:review']);

describe('inlineContentFromText', () => {
  it('turns references into chips and keeps surrounding text', () => {
    expect(inlineContentFromText('/skill:review check @src/a.ts now', commands)).toEqual([
      { type: 'mention', attrs: { id: 'skill:review', mentionSuggestionChar: '/' } },
      { type: 'text', text: ' check ' },
      { type: 'mention', attrs: { id: 'src/a.ts', mentionSuggestionChar: '@' } },
      { type: 'text', text: ' now' },
    ]);
  });

  it('maps line breaks to hard breaks, keeping blank lines', () => {
    expect(inlineContentFromText('a\r\n\nb', commands)).toEqual([
      { type: 'text', text: 'a' },
      { type: 'hardBreak' },
      { type: 'hardBreak' },
      { type: 'text', text: 'b' },
    ]);
  });

  it('leaves unknown commands as text', () => {
    expect(inlineContentFromText('/compact', commands)).toEqual([
      { type: 'text', text: '/compact' },
    ]);
  });
});

describe('composerDocumentFromText', () => {
  it('wraps content in a single paragraph', () => {
    expect(composerDocumentFromText('', commands)).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    });
  });
});

describe('serializeReference', () => {
  it('round-trips with the parser', () => {
    expect(serializeReference('skill', 'skill:review')).toBe('/skill:review');
    expect(serializeReference('file', 'my docs/a.md')).toBe('@"my docs/a.md"');
  });
});
