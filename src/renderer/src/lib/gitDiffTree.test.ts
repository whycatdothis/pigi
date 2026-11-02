import { describe, expect, it } from 'vitest';
import type { GitDiffFile } from '../../../shared/ipcContract';
import { buildGitDiffTree } from './gitDiffTree';

function file(path: string): GitDiffFile {
  return {
    path,
    oldPath: null,
    status: 'modified',
    additions: 1,
    deletions: 0,
    binary: false,
    workingTreeStatus: null,
  };
}

describe('buildGitDiffTree', () => {
  it('groups nested paths into sorted directories with root files first', () => {
    const tree = buildGitDiffTree([
      file('src/components/zeta.tsx'),
      file('README.md'),
      file('src/alpha.ts'),
      file('src/components/App.tsx'),
    ]);

    expect(tree.files.map((item) => item.path)).toEqual(['README.md']);
    expect(tree.directories.map((child) => child.name)).toEqual(['src']);
    const [src] = tree.directories;
    expect(src.files.map((item) => item.path)).toEqual(['src/alpha.ts']);
    expect(src.directories.map((child) => child.name)).toEqual(['components']);
    const [components] = src.directories;
    expect(components.files.map((item) => item.path)).toEqual([
      'src/components/App.tsx',
      'src/components/zeta.tsx',
    ]);
    expect(components.path).toBe('src/components');
  });

  it('compacts directories that only hold one directory', () => {
    const tree = buildGitDiffTree([
      file('src/main/java/com/example/App.java'),
      file('src/main/java/com/example/util/Strings.java'),
      file('src/test/java/com/example/AppTest.java'),
    ]);

    const [src] = tree.directories;
    expect(src.name).toBe('src');
    expect(src.directories.map((child) => [child.name, child.path])).toEqual([
      ['main/java/com/example', 'src/main/java/com/example'],
      ['test/java/com/example', 'src/test/java/com/example'],
    ]);
    const [main] = src.directories;
    expect(main.directories.map((child) => child.name)).toEqual(['util']);
  });

  it('sorts numbered directory names numerically', () => {
    const tree = buildGitDiffTree([file('v10/a.ts'), file('v2/a.ts'), file('V1/a.ts')]);
    expect(tree.directories.map((child) => child.name)).toEqual(['V1', 'v2', 'v10']);
  });

  it('returns an empty root for no files', () => {
    expect(buildGitDiffTree([])).toEqual({ name: '', path: '', directories: [], files: [] });
  });
});
