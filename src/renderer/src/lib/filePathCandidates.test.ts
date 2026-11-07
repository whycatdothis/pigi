import { describe, expect, it } from 'vitest';
import {
  filePathFromCode,
  filePathFromHref,
  findFilePathCandidates,
  formatLineSuffix,
  leadingLineSuffix,
  splitLineSuffix,
} from './filePathCandidates';

function paths(text: string): string[] {
  return findFilePathCandidates(text).map((candidate) => candidate.path);
}

function linkTexts(text: string): string[] {
  return findFilePathCandidates(text).map((candidate) =>
    text.slice(candidate.start, candidate.end),
  );
}

describe('findFilePathCandidates', () => {
  it('finds relative, absolute and home paths in prose', () => {
    expect(paths('see src/main.ts, /etc/hosts and ~/.pi/agent/AGENTS.md')).toEqual([
      'src/main.ts',
      '/etc/hosts',
      '~/.pi/agent/AGENTS.md',
    ]);
  });

  it('takes a path written straight into CJK prose on its own', () => {
    expect(paths('修改了src/a.ts文件，还有docs/b.md。')).toEqual(['src/a.ts', 'docs/b.md']);
  });

  it('leaves sentence punctuation out and keeps a line suffix in the link', () => {
    expect(paths('Edit docs/todo.md.')).toEqual(['docs/todo.md']);
    expect(linkTexts('at src/a.ts:12 and src/b.ts#L3-L9.')).toEqual([
      'src/a.ts:12',
      'src/b.ts#L3-L9',
    ]);
    expect(paths('at src/a.ts:12')).toEqual(['src/a.ts']);
  });

  it('reads the line range a suffix names', () => {
    expect(
      findFilePathCandidates('see website/src/lib/site.ts:55-56 and src/b.ts.').map(
        (candidate) => candidate.lines,
      ),
    ).toEqual([{ start: 55, end: 56 }, null]);
  });

  it('ignores versions, URLs, folders and words without a path shape', () => {
    expect(paths('v1.2.3 and 1.0 and https://example.com/a.ts and src/ and hello')).toEqual([]);
  });

  it('leaves a bare name in prose to code spans', () => {
    expect(paths('Node.js, e.g. obj.method, foo@bar.com or README.md')).toEqual([]);
  });

  it('reads an @ reference as the path after it', () => {
    expect(paths('look at @src/a.ts')).toEqual(['src/a.ts']);
  });
});

describe('filePathFromCode', () => {
  it('accepts a span that is only a path', () => {
    expect(filePathFromCode('src/[id]/page.tsx')).toEqual({
      path: 'src/[id]/page.tsx',
      lines: null,
    });
    expect(filePathFromCode(' package.json:3 ')).toEqual({
      path: 'package.json',
      lines: { start: 3, end: 3 },
    });
  });

  it('rejects commands and plain words', () => {
    expect(filePathFromCode('npm run check')).toBeNull();
    expect(filePathFromCode('useEffect')).toBeNull();
  });
});

describe('filePathFromHref', () => {
  it('keeps local paths and drops URLs and anchors', () => {
    expect(filePathFromHref('docs/my%20guide.md#intro')).toEqual({
      path: 'docs/my guide.md',
      lines: null,
    });
    expect(filePathFromHref('/abs/file.ts#L3-L9')).toEqual({
      path: '/abs/file.ts',
      lines: { start: 3, end: 9 },
    });
    expect(filePathFromHref('https://example.com')).toBeNull();
    expect(filePathFromHref('#section')).toBeNull();
  });
});

describe('line suffixes', () => {
  it('reads ranges, single lines and drops a column', () => {
    expect(splitLineSuffix('src/a.ts:55-56')).toEqual({
      path: 'src/a.ts',
      lines: { start: 55, end: 56 },
    });
    expect(splitLineSuffix('src/a.ts:L30-L50').lines).toEqual({ start: 30, end: 50 });
    expect(splitLineSuffix('src/a.ts:12:5').lines).toEqual({ start: 12, end: 12 });
    expect(splitLineSuffix('src/a.ts:9-3').lines).toEqual({ start: 3, end: 9 });
    expect(splitLineSuffix('src/a.ts')).toEqual({ path: 'src/a.ts', lines: null });
  });

  it('reads a suffix at the start of the text after a reference', () => {
    expect(leadingLineSuffix(':55-56, then')).toEqual({
      length: 6,
      lines: { start: 55, end: 56 },
    });
    expect(leadingLineSuffix(' :55')).toBeNull();
    expect(leadingLineSuffix(':12abc')).toBeNull();
  });

  it('writes a single line and a range', () => {
    expect(formatLineSuffix({ start: 55, end: 55 })).toBe(':55');
    expect(formatLineSuffix({ start: 55, end: 56 })).toBe(':55-56');
  });
});
