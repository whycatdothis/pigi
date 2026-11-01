import type { GitDiffFile } from '../../../shared/ipcContract';

export interface GitDiffTreeDirectory {
  name: string;
  path: string;
  directories: GitDiffTreeDirectory[];
  files: GitDiffFile[];
}

interface MutableDirectory {
  name: string;
  path: string;
  directories: Map<string, MutableDirectory>;
  files: GitDiffFile[];
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
}

function toTree(directory: MutableDirectory): GitDiffTreeDirectory {
  return {
    name: directory.name,
    path: directory.path,
    directories: [...directory.directories.values()]
      .sort((left, right) => compareNames(left.name, right.name))
      .map(toTree),
    files: [...directory.files].sort((left, right) => compareNames(left.path, right.path)),
  };
}

/** Group changed file paths into the directory tree the Diff sidebar shows. */
export function buildGitDiffTree(files: readonly GitDiffFile[]): GitDiffTreeDirectory {
  const root: MutableDirectory = { name: '', path: '', directories: new Map(), files: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let directory = root;
    for (const part of parts.slice(0, -1)) {
      let child = directory.directories.get(part);
      if (!child) {
        child = {
          name: part,
          path: directory.path ? `${directory.path}/${part}` : part,
          directories: new Map(),
          files: [],
        };
        directory.directories.set(part, child);
      }
      directory = child;
    }
    directory.files.push(file);
  }

  return toTree(root);
}
