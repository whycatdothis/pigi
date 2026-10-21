import { dialog, ipcMain } from 'electron';
import { PiChannel, type ProjectStateResult } from '../../shared/ipcContract';
import { getMainWindow } from '../windows/createMainWindow';
import {
  addRecentProject,
  getProjectState,
  removeRecentProject,
  reorderRecentProjects,
  setActiveProject,
} from '../projects/projectStore';
import { getGitBranch } from '../projects/gitStatus';
import { searchProjectFiles } from '../projects/projectFileSearch';
import { completePath } from '../projects/pathCompletion';

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

  ipcMain.handle(PiChannel.SearchProjectFiles, async (_event, cwd: string, query: string) => {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    return searchProjectFiles(cwd, typeof query === 'string' ? query : '');
  });

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
