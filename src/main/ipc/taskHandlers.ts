import { dialog, ipcMain } from 'electron';
import {
  PiChannel,
  type ListTasksResult,
  type PickDirectoryResult,
  type TaskDirSource,
  type TaskResult,
  type TaskUpdate,
} from '../../shared/ipcContract';
import { createTask, listTasks, reportTaskDirs, updateTask } from '../tasks/taskStore';
import { getMainWindow } from '../windows/createMainWindow';

function errorResult(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

function isTaskPath(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseTaskUpdate(value: unknown): TaskUpdate | null {
  if (!isRecord(value)) return null;
  const update: TaskUpdate = {};
  for (const key of ['addWorkDirs', 'removeWorkDirs', 'ignoreSuggestedDirs'] as const) {
    const list = value[key];
    if (list === undefined) continue;
    if (!isStringArray(list)) return null;
    update[key] = list;
  }
  if ('setActiveWorkDir' in value) {
    const activeWorkDir = value.setActiveWorkDir;
    if (activeWorkDir !== null && typeof activeWorkDir !== 'string') return null;
    update.setActiveWorkDir = activeWorkDir;
  }
  if ('renameTo' in value) {
    if (typeof value.renameTo !== 'string') return null;
    update.renameTo = value.renameTo;
  }
  if ('setHidden' in value) {
    if (typeof value.setHidden !== 'boolean') return null;
    update.setHidden = value.setHidden;
  }
  if ('setEmoji' in value) {
    const emoji = value.setEmoji;
    if (emoji !== null && (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 16)) {
      return null;
    }
    update.setEmoji = emoji;
  }
  return update;
}

export function registerTaskHandlers(): void {
  ipcMain.handle(PiChannel.ListTasks, async (): Promise<ListTasksResult> => {
    try {
      return { success: true, tasks: await listTasks() };
    } catch (error) {
      return errorResult(error);
    }
  });

  ipcMain.handle(PiChannel.CreateTask, async (_event, name: unknown): Promise<TaskResult> => {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { success: false, error: 'name must be a non-empty string' };
    }
    try {
      return { success: true, task: await createTask(name.trim()) };
    } catch (error) {
      return errorResult(error);
    }
  });

  ipcMain.handle(
    PiChannel.UpdateTask,
    async (_event, taskPath: unknown, update: unknown): Promise<TaskResult> => {
      if (!isTaskPath(taskPath))
        return { success: false, error: 'taskPath must be a non-empty string' };
      const parsed = parseTaskUpdate(update);
      if (!parsed) {
        return { success: false, error: 'update must be a TaskUpdate object' };
      }
      try {
        return { success: true, task: await updateTask(taskPath, parsed) };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  ipcMain.handle(
    PiChannel.ReportTaskDirs,
    async (_event, taskPath: unknown, paths: unknown, source: unknown): Promise<TaskResult> => {
      if (!isTaskPath(taskPath))
        return { success: false, error: 'taskPath must be a non-empty string' };
      if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
        return { success: false, error: 'paths must be a string array' };
      }
      if (source !== 'prompt' && source !== 'tool' && source !== 'model') {
        return { success: false, error: 'source must be "prompt", "tool" or "model"' };
      }
      const dirSource: TaskDirSource = source;
      try {
        return { success: true, task: await reportTaskDirs(taskPath, paths, dirSource) };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // Unlike OpenProjectDirectory this adds nothing to the recent projects: the
  // caller decides what the picked directory is for.
  ipcMain.handle(PiChannel.PickDirectory, async (): Promise<PickDirectoryResult> => {
    try {
      const win = getMainWindow();
      const options = { properties: ['openDirectory' as const] };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      return { success: true, path: result.canceled ? null : (result.filePaths[0] ?? null) };
    } catch (error) {
      return errorResult(error);
    }
  });
}
