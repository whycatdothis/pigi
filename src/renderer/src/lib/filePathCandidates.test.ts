import { describe, expect, it } from 'vitest';
import { filePathFromCode, filePathFromHref, findFilePathCandidates } from './filePathCandidates';

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
    expect(filePathFromCode('src/[id]/page.tsx')).toBe('src/[id]/page.tsx');
    expect(filePathFromCode(' package.json:3 ')).toBe('package.json');
  });

  it('rejects commands and plain words', () => {
    expect(filePathFromCode('npm run check')).toBeNull();
    expect(filePathFromCode('useEffect')).toBeNull();
  });
});

describe('filePathFromHref', () => {
  it('keeps local paths and drops URLs and anchors', () => {
    expect(filePathFromHref('docs/my%20guide.md#intro')).toBe('docs/my guide.md');
    expect(filePathFromHref('/abs/file.ts')).toBe('/abs/file.ts');
    expect(filePathFromHref('https://example.com')).toBeNull();
    expect(filePathFromHref('#section')).toBeNull();
  });
});
