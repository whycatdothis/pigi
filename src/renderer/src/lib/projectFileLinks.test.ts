import { describe, expect, it } from 'vitest';
import { projectRelativePath, resolveProjectFileReference } from './projectFileLinks';

describe('resolveProjectFileReference', () => {
  const projectPath = '/repo';
  const sourceFilePath = 'docs/guide.md';

  it('resolves a sibling reference against the source directory', () => {
    expect(resolveProjectFileReference(projectPath, sourceFilePath, './images/dot.png')).toEqual({
      path: 'docs/images/dot.png',
      absolutePath: '/repo/docs/images/dot.png',
    });
    expect(resolveProjectFileReference(projectPath, sourceFilePath, 'images/dot.png')).toEqual({
      path: 'docs/images/dot.png',
      absolutePath: '/repo/docs/images/dot.png',
    });
  });

  it('resolves parent references while staying inside the project', () => {
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '../assets/logo.svg')).toEqual({
      path: 'assets/logo.svg',
      absolutePath: '/repo/assets/logo.svg',
    });
    expect(resolveProjectFileReference(projectPath, sourceFilePath, 'a/../../README.md')).toEqual({
      path: 'README.md',
      absolutePath: '/repo/README.md',
    });
  });

  it('treats a leading slash as the project root', () => {
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '/images/dot.png')).toEqual({
      path: 'images/dot.png',
      absolutePath: '/repo/images/dot.png',
    });
  });

  it('decodes spaces and ignores query strings and fragments', () => {
    expect(
      resolveProjectFileReference(projectPath, sourceFilePath, 'images/my%20dot.png?raw=1#preview'),
    ).toEqual({
      path: 'docs/images/my dot.png',
      absolutePath: '/repo/docs/images/my dot.png',
    });
  });

  it('keeps a trailing slash on the project root from doubling the separator', () => {
    expect(resolveProjectFileReference('/repo/', sourceFilePath, 'dot.png')).toEqual({
      path: 'docs/dot.png',
      absolutePath: '/repo/docs/dot.png',
    });
  });

  it('normalizes backslashes and treats a trailing slash as the same target', () => {
    expect(resolveProjectFileReference(projectPath, sourceFilePath, 'images\\dot.png')).toEqual({
      path: 'docs/images/dot.png',
      absolutePath: '/repo/docs/images/dot.png',
    });
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '../docs/')).toEqual({
      path: 'docs',
      absolutePath: '/repo/docs',
    });
  });

  it('rejects references that leave the project or have no target', () => {
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '../../etc/passwd')).toBeNull();
    expect(
      resolveProjectFileReference(projectPath, sourceFilePath, '%2e%2e/%2e%2e/etc'),
    ).toBeNull();
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '/../etc/passwd')).toBeNull();
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '.')).toBeNull();
    expect(resolveProjectFileReference(projectPath, sourceFilePath, './..')).toBeNull();
    expect(resolveProjectFileReference(projectPath, sourceFilePath, 'C:\\x')).toBeNull();
    expect(
      resolveProjectFileReference(projectPath, sourceFilePath, '\\\\server\\share\\dot.png'),
    ).toBeNull();
    expect(
      resolveProjectFileReference(projectPath, sourceFilePath, '%2F%2Fexample.com/dot.png'),
    ).toBeNull();
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '')).toBeNull();
  });

  it('leaves URLs and anchors alone', () => {
    expect(
      resolveProjectFileReference(projectPath, sourceFilePath, 'https://example.com'),
    ).toBeNull();
    expect(
      resolveProjectFileReference(projectPath, sourceFilePath, 'data:image/png;base64,abc'),
    ).toBeNull();
    expect(
      resolveProjectFileReference(projectPath, sourceFilePath, '//example.com/dot.png'),
    ).toBeNull();
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '#section')).toBeNull();
    expect(resolveProjectFileReference(projectPath, sourceFilePath, '?raw=1')).toBeNull();
  });
});

describe('resolveProjectFileReference from a file outside the project', () => {
  it('resolves beside the file, never against the project', () => {
    expect(resolveProjectFileReference('/repo', '/notes/a/guide.md', '../b.md')).toEqual({
      path: '/notes/b.md',
      absolutePath: '/notes/b.md',
    });
    expect(resolveProjectFileReference('/repo', '/notes/guide.md', '/b.md')).toBeNull();
    expect(resolveProjectFileReference('/repo', '/guide.md', '../b.md')).toBeNull();
  });
});

describe('projectRelativePath', () => {
  it('names a project file relative to the project and keeps others absolute', () => {
    expect(projectRelativePath('/repo', '/repo/src/a.ts')).toBe('src/a.ts');
    expect(projectRelativePath('/repo/', '/repo/src/a.ts')).toBe('src/a.ts');
    expect(projectRelativePath('/repo', '/repository/a.ts')).toBe('/repository/a.ts');
    expect(projectRelativePath('/repo', 'src/a.ts')).toBe('src/a.ts');
  });
});
