import { dialog, ipcMain } from 'electron';
import {
  PiChannel,
  type GitDiffScope,
  type GitDiffSource,
  type ProjectStateResult,
} from '../../shared/ipcContract';
import { getMainWindow } from '../windows/createMainWindow';
import {
  addRecentProject,
  getProjectState,
  removeRecentProject,
  reorderRecentProjects,
  setActiveProject,
} from '../projects/projectStore';
import { getGitBranch } from '../projects/gitStatus';
import {
  getGitCommitFiles,
  getGitDiffFile,
  getGitDiffSummary,
  listGitBranches,
  setGitStaged,
} from '../projects/gitDiff';
import { searchProjectFiles } from '../projects/projectFileSearch';
import { completePath } from '../projects/pathCompletion';
import {
  listProjectDirectory,
  readProjectFile,
  resolveExistingPaths,
} from '../projects/projectFiles';
import { setProjectFileWatch } from '../projects/projectFileWatch';

function parseGitDiffScope(value: unknown): GitDiffScope | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null;
  if (value.kind === 'uncommitted' || value.kind === 'lastCommit' || value.kind === 'status') {
    return { kind: value.kind };
  }
  if (value.kind !== 'branch') return null;
  const base = 'base' in value ? value.base : null;
  if (base === null || base === undefined) return { kind: 'branch', base: null };
  return typeof base === 'string' ? { kind: 'branch', base } : null;
}

function parseGitDiffSource(value: unknown): GitDiffSource | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null;
  if (value.kind === 'staged' || value.kind === 'unstaged') return { kind: value.kind };
  if (value.kind === 'base' && 'base' in value && typeof value.base === 'string' && value.base) {
    return { kind: 'base', base: value.base };
  }
  if (
    value.kind === 'commit' &&
    'commit' in value &&
    typeof value.commit === 'string' &&
    value.commit
  ) {
    return { kind: 'commit', commit: value.commit };
  }
  return null;
}

function projectStateResult(): ProjectStateResult {
  return {
    success: true,
    ...getProjectState(),
  };
}

export function registerProjectHandlers(): void {
  ipcMain.handle(PiChannel.GetProjects, async () => projectStateResult());

  ipcMain.handle(PiChannel.GetGitBranch, async (_event, cwd: string) => {
    return getGitBranch(cwd);
  });

  ipcMain.handle(PiChannel.GetGitDiffSummary, async (_event, cwd: unknown, scope: unknown) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    const diffScope = parseGitDiffScope(scope);
    if (!diffScope) {
      return { success: false, error: 'scope must be branch, uncommitted, lastCommit or status' };
    }
    return getGitDiffSummary(cwd, diffScope);
  });

  ipcMain.handle(
    PiChannel.GetGitDiffFile,
    async (_event, cwd: unknown, source: unknown, path: unknown, oldPath: unknown) => {
      if (typeof cwd !== 'string' || cwd.trim().length === 0) {
        return { success: false, error: 'cwd must be a non-empty string' };
      }
      const diffSource = parseGitDiffSource(source);
      if (!diffSource) {
        return { success: false, error: 'source must be a base, a commit, staged or unstaged' };
      }
      if (typeof path !== 'string' || path.length === 0) {
        return { success: false, error: 'path must be a non-empty string' };
      }
      if (oldPath !== null && oldPath !== undefined && typeof oldPath !== 'string') {
        return { success: false, error: 'oldPath must be a string or null' };
      }
      return getGitDiffFile(cwd, diffSource, path, typeof oldPath === 'string' ? oldPath : null);
    },
  );

  ipcMain.handle(PiChannel.GetGitCommitFiles, async (_event, cwd: unknown, commit: unknown) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    if (typeof commit !== 'string' || commit.length === 0) {
      return { success: false, error: 'commit must be a non-empty string' };
    }
    return getGitCommitFiles(cwd, commit);
  });

  ipcMain.handle(PiChannel.ListGitBranches, async (_event, cwd: unknown) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    return listGitBranches(cwd);
  });

  ipcMain.handle(PiChannel.SetGitStaged, async (_event, cwd: unknown, staged: unknown) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    if (typeof staged !== 'boolean') {
      return { success: false, error: 'staged must be a boolean' };
    }
    return setGitStaged(cwd, staged);
  });

  ipcMain.handle(
    PiChannel.SearchProjectFiles,
    async (_event, cwd: string, query: string, limit?: number) => {
      if (typeof cwd !== 'string' || cwd.trim().length === 0) {
        return { success: false, error: 'cwd must be a non-empty string' };
      }
      return searchProjectFiles(
        cwd,
        typeof query === 'string' ? query : '',
        typeof limit === 'number' ? limit : undefined,
      );
    },
  );

  ipcMain.handle(PiChannel.ListProjectDirectory, async (_event, cwd: string, path: string) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    if (typeof path !== 'string') {
      return { success: false, error: 'path must be a string' };
    }
    return listProjectDirectory(cwd, path);
  });

  ipcMain.handle(PiChannel.ReadProjectFile, async (_event, cwd: string, path: string) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, error: 'path must be a non-empty string' };
    }
    return readProjectFile(cwd, path);
  });

  ipcMain.handle(PiChannel.ResolveExistingPaths, async (_event, cwd: unknown, paths: unknown) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) return [];
    if (!Array.isArray(paths) || !paths.every((path): path is string => typeof path === 'string')) {
      return [];
    }
    return resolveExistingPaths(cwd, paths);
  });

  ipcMain.on(
    PiChannel.WatchProjectFiles,
    (_event, cwd: unknown, directories: unknown, filePath: unknown) => {
      if (typeof cwd !== 'string' || cwd.trim().length === 0) return;
      if (
        !Array.isArray(directories) ||
        !directories.every((directory): directory is string => typeof directory === 'string')
      ) {
        return;
      }
      if (filePath !== null && typeof filePath !== 'string') return;
      setProjectFileWatch(cwd, directories, filePath);
    },
  );

  ipcMain.handle(PiChannel.CompletePath, async (_event, cwd: string, token: string) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    if (typeof token !== 'string') {
      return { success: false, error: 'token must be a string' };
    }
    return completePath(cwd, token);
  });

  ipcMain.handle(PiChannel.SetActiveProject, async (_event, path: string) => {
    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      return { success: false, error: 'path must be a non-empty string' };
    }

    setActiveProject(path);
    return projectStateResult();
  });

  ipcMain.handle(PiChannel.OpenProjectDirectory, async () => {
    const win = getMainWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
        });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    addRecentProject(result.filePaths[0]);
    return projectStateResult();
  });

  ipcMain.handle(PiChannel.RemoveProject, async (_event, path: string) => {
    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      return { success: false, error: 'path must be a non-empty string' };
    }
    removeRecentProject(path);
    return projectStateResult();
  });

  ipcMain.handle(PiChannel.ReorderProjects, async (_event, paths: string[]) => {
    if (!Array.isArray(paths)) {
      return { success: false, error: 'paths must be an array' };
    }
    reorderRecentProjects(paths);
    return projectStateResult();
  });
}
