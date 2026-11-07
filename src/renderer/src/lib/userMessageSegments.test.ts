import { describe, expect, it } from 'vitest';
import { userMessageSegments } from './userMessageSegments';

describe('userMessageSegments', () => {
  it('splits @ references and absolute paths out of the prompt', () => {
    expect(userMessageSegments('read @src/a.ts and /repo/b.ts:12 then ~/notes/')).toEqual([
      { kind: 'text', start: 0, text: 'read ' },
      { kind: 'reference', start: 5, text: '@src/a.ts', path: 'src/a.ts', lines: null },
      { kind: 'text', start: 14, text: ' and ' },
      {
        kind: 'path',
        start: 19,
        text: '/repo/b.ts:12',
        path: '/repo/b.ts',
        lines: { start: 12, end: 12 },
      },
      { kind: 'text', start: 32, text: ' then ' },
      { kind: 'path', start: 38, text: '~/notes/', path: '~/notes/', lines: null },
    ]);
  });

  it('keeps a quote line range in the reference chip', () => {
    expect(userMessageSegments('see @src/a.ts:55-56, and @"my a.md":3')).toEqual([
      { kind: 'text', start: 0, text: 'see ' },
      {
        kind: 'reference',
        start: 4,
        text: '@src/a.ts:55-56',
        path: 'src/a.ts',
        lines: { start: 55, end: 56 },
      },
      { kind: 'text', start: 19, text: ', and ' },
      {
        kind: 'reference',
        start: 25,
        text: '@"my a.md":3',
        path: 'my a.md',
        lines: { start: 3, end: 3 },
      },
    ]);
  });

  it('ends a chip at CJK punctuation', () => {
    expect(
      userMessageSegments('看下 @a.md，还有 /repo/b.ts。').map((segment) => segment.text),
    ).toEqual(['看下 ', '@a.md', '，还有 ', '/repo/b.ts', '。']);
  });

  it('keeps a mid-sentence /command and a glued @ as text', () => {
    expect(userMessageSegments('run /compact, mail a@b.com')).toEqual([
      { kind: 'text', start: 0, text: 'run /compact, mail a@b.com' },
    ]);
  });
});
