import { watch, type FSWatcher } from 'node:fs';
import { sep } from 'node:path';
import { PiChannel, type ProjectFilesChanged } from '../../shared/ipcContract';
import { getMainWindow } from '../windows/createMainWindow';
import { resolveProjectPath } from './projectFiles';

/**
 * Tree changes arrive in bursts (a build writing thousands of files); one IPC
 * message per debounce window is enough to repaint a directory listing.
 */
const FLUSH_DELAY_MS = 80;

interface WatchState {
  projectPath: string;
  treeDirectories: Set<string>;
  activeFilePath: string | null;
  /** Absolute directory -> watcher. Active-file and tree watches share this set. */
  watchers: Map<string, FSWatcher>;
  pendingDirectories: Set<string>;
  pendingFiles: Set<string>;
  timer: NodeJS.Timeout | null;
}

const states = new Map<string, WatchState>();

function parentDirectory(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
}

/** Project-relative path using `/`; `''` is the root. Null rejects `..` and absolute paths. */
function normalizeRelativePath(path: string): string | null {
  if (path.includes('\0')) return null;
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return '';
  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return segments.join('/');
}

/** fs.watch reports OS separators; project-relative paths always use `/`. */
function watchEventName(filename: string | Buffer | null): string {
  return filename?.toString().replaceAll(sep, '/') ?? '';
}

function sendChange(change: ProjectFilesChanged): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(PiChannel.ProjectFilesChanged, change);
  }
}

function flush(state: WatchState): void {
  if (states.get(state.projectPath) !== state) return;

  const directories = [...state.pendingDirectories].filter((directory) =>
    state.treeDirectories.has(directory),
  );
  const filePath =
    state.activeFilePath && state.pendingFiles.has(state.activeFilePath)
      ? state.activeFilePath
      : null;
  state.pendingDirectories.clear();
  state.pendingFiles.clear();

  if (directories.length === 0 && filePath === null) return;
  sendChange({ cwd: state.projectPath, directories, filePath });
}

function scheduleFlush(state: WatchState): void {
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flush(state);
  }, FLUSH_DELAY_MS);
}

function handleWatchEvent(
  state: WatchState,
  directory: string,
  eventType: 'rename' | 'change',
  filename: string | Buffer | null,
): void {
  if (states.get(state.projectPath) !== state) return;

  const name = watchEventName(filename);
  const childPath = name ? (directory ? `${directory}/${name}` : name) : null;

  // `change` means file contents; it cannot add or remove a tree entry.
  // A missing filename is opaque, so reload rather than guess.
  if (eventType === 'rename' || childPath === null) {
    if (state.treeDirectories.has(directory)) {
      state.pendingDirectories.add(directory);
    }
  }

  const activeFilePath = state.activeFilePath;
  if (!activeFilePath) {
    if (state.pendingDirectories.size > 0) scheduleFlush(state);
    return;
  }

  const activeChanged =
    (childPath !== null &&
      (childPath === activeFilePath || activeFilePath.startsWith(`${childPath}/`))) ||
    (childPath === null && directory === parentDirectory(activeFilePath));
  if (activeChanged) state.pendingFiles.add(activeFilePath);

  if (state.pendingDirectories.size > 0 || state.pendingFiles.size > 0) {
    scheduleFlush(state);
  }
}

function syncWatchers(state: WatchState): void {
  const desired = new Map<string, string>();
  for (const directory of state.treeDirectories) {
    const absolute = resolveProjectPath(state.projectPath, directory);
    if (absolute) desired.set(absolute, directory);
  }
  if (state.activeFilePath) {
    const directory = parentDirectory(state.activeFilePath);
    const absolute = resolveProjectPath(state.projectPath, directory);
    if (absolute) desired.set(absolute, directory);
  }

  for (const [absolute, watcher] of state.watchers) {
    if (desired.has(absolute)) continue;
    watcher.close();
    state.watchers.delete(absolute);
  }

  for (const [absolute, directory] of desired) {
    if (state.watchers.has(absolute)) continue;
    try {
      const watcher = watch(absolute, { persistent: false }, (eventType, filename) => {
        handleWatchEvent(state, directory, eventType, filename);
      });
      watcher.on('error', () => {
        if (state.watchers.get(absolute) !== watcher) return;
        state.watchers.delete(absolute);
        watcher.close();
      });
      state.watchers.set(absolute, watcher);
    } catch {
      // The directory may have disappeared between listing it and watching it;
      // the next tree refresh can add the replacement.
    }
  }
}

function disposeState(projectPath: string, state: WatchState): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  for (const watcher of state.watchers.values()) watcher.close();
  state.watchers.clear();
  state.pendingDirectories.clear();
  state.pendingFiles.clear();
  if (states.get(projectPath) === state) states.delete(projectPath);
}

/**
 * Replace the watch set for one project. The renderer sends the root plus every
 * expanded directory, and the active file so a collapsed file can still update.
 * Only these directories are watched: a recursive project watch would duplicate
 * the work for thousands of directories the tree will never display.
 */
export function setProjectFileWatch(
  projectPath: string,
  directories: readonly string[],
  activeFilePath: string | null,
): void {
  if (projectPath.trim().length === 0) return;

  const treeDirectories = new Set<string>();
  for (const directory of directories) {
    const normalized = normalizeRelativePath(directory);
    if (normalized === null) continue;
    if (!resolveProjectPath(projectPath, normalized)) continue;
    treeDirectories.add(normalized);
  }

  const normalizedActive = activeFilePath === null ? null : normalizeRelativePath(activeFilePath);
  const active =
    normalizedActive && resolveProjectPath(projectPath, normalizedActive) ? normalizedActive : null;

  let state = states.get(projectPath);
  if (!state) {
    if (treeDirectories.size === 0 && active === null) return;
    state = {
      projectPath,
      treeDirectories,
      activeFilePath: active,
      watchers: new Map(),
      pendingDirectories: new Set(),
      pendingFiles: new Set(),
      timer: null,
    };
    states.set(projectPath, state);
  } else {
    state.treeDirectories = treeDirectories;
    state.activeFilePath = active;
  }

  syncWatchers(state);
  if (state.treeDirectories.size === 0 && state.activeFilePath === null) {
    disposeState(projectPath, state);
  }
}

export function stopProjectFileWatch(): void {
  for (const [projectPath, state] of states) disposeState(projectPath, state);
  states.clear();
}
