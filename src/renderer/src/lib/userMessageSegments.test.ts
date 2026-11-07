import { describe, expect, it } from 'vitest';
import { userMessageSegments } from './userMessageSegments';

describe('userMessageSegments', () => {
  it('splits @ references and absolute paths out of the prompt', () => {
    expect(userMessageSegments('read @src/a.ts and /repo/b.ts:12 then ~/notes/')).toEqual([
      { kind: 'text', start: 0, text: 'read ' },
      { kind: 'reference', start: 5, text: '@src/a.ts', path: 'src/a.ts' },
      { kind: 'text', start: 14, text: ' and ' },
      { kind: 'path', start: 19, text: '/repo/b.ts', path: '/repo/b.ts', isDirectory: false },
      { kind: 'text', start: 29, text: ':12 then ' },
      { kind: 'path', start: 38, text: '~/notes/', path: '~/notes/', isDirectory: true },
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
