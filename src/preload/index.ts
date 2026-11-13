/**
 * Preload script - exposes piApi to renderer via contextBridge.
 *
 * After session creation, communication goes directly over control/data MessagePorts.
 * Main process is only involved for lifecycle (create/resume/destroy session).
 */
import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { readFileSync } from 'node:fs';
import {
  PiChannel,
  isPiPush,
  isPiResult,
  isStreamBatch,
  type ControlPortMessage,
  type CacheWarmEntry,
  type CreateSessionOptions,
  type DataPortMessage,
  type RemoteCommandOutput,
  type RemoteCommandRequest,
  type GitBranchResult,
  type GitBranchListResult,
  type GitCommitFilesResult,
  type GitStageResult,
  type GitDiffFileResult,
  type GitDiffScope,
  type GitDiffSource,
  type GitDiffSummaryResult,
  type ModelCatalogSnapshot,
  type PiCommand,
  type PiPush,
  type PiRequest,
  type PickAttachmentsResult,
  type ChatAttachmentKind,
  type ProjectDirectoryResult,
  type ExistingPath,
  type ProjectFileResult,
  type ProjectFilesChanged,
  type ProjectFileSearchResult,
  type PathCompletionResult,
  type ProjectSessionsChunk,
  type ProjectStateResult,
  type SessionListResult,
  type ShortcutBinding,
  type RendererTelemetryReport,
  type ShortcutDefinition,
  type StreamBatch,
  type TerminalInboundMessage,
  type TerminalOutboundMessage,
  type UpdateStatus,
} from '../shared/ipcContract';
import type { PiSettingsResult, PiSettingsScope, PiSettingUpdate } from '../shared/piSettings';
import type {
  CatalogPackageDetailResult,
  CatalogSearchResult,
  PiPackageOperation,
  PiPackageOperationResult,
  PiPackagesHealthResult,
  PiPackagesResult,
} from '../shared/piPackages';
import {
  PIGI_SETTINGS_PATH_ARGUMENT,
  PIGI_SETTINGS_READ_STATE,
  isMissingFileError,
  type PigiSettingsChange,
  type PigiSettingsReadResult,
} from '../shared/pigiSettings';

// Main passes the pigi settings path through `additionalArguments`.

const settingsPathArgument = process.argv.find((argument) =>
  argument.startsWith(PIGI_SETTINGS_PATH_ARGUMENT),
);
const pigiSettingsPath = settingsPathArgument
  ? settingsPathArgument.slice(PIGI_SETTINGS_PATH_ARGUMENT.length)
  : null;

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface PendingPortWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface SessionPort {
  controlPort: MessagePort;
  dataPort: MessagePort;
  pending: Map<string, PendingCommand>;
  pushHandlers: Set<(message: PiPush) => void>;
  streamHandlers: Set<(batch: StreamBatch) => void>;
  requestId: number;
}

const sessionPorts = new Map<string, SessionPort>();
const SESSION_PORT_CLOSED_ERROR = 'session process exited';
const PORT_READY_TIMEOUT_MS = 5000;

/** Handlers registered before port arrives */
const pendingPushHandlers = new Map<string, Set<(message: PiPush) => void>>();
const pendingStreamHandlers = new Map<string, Set<(batch: StreamBatch) => void>>();
const pendingPortWaiters = new Map<string, Set<PendingPortWaiter>>();

function cleanupPendingPortWaiters(sessionPath: string, error: Error): void {
  const waiters = pendingPortWaiters.get(sessionPath);
  if (!waiters) {
    return;
  }

  for (const waiter of waiters) {
    clearTimeout(waiter.timeoutId);
    waiter.reject(error);
  }
  pendingPortWaiters.delete(sessionPath);
}

function waitForPort(sessionPath: string): Promise<void> {
  if (sessionPorts.has(sessionPath)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const waiters = pendingPortWaiters.get(sessionPath);
      if (waiters) {
        waiters.delete(waiter);
        if (waiters.size === 0) {
          pendingPortWaiters.delete(sessionPath);
        }
      }
      reject(new Error(`port for session ${sessionPath} did not arrive`));
    }, PORT_READY_TIMEOUT_MS);

    const waiter: PendingPortWaiter = { resolve, reject, timeoutId };
    const waiters = pendingPortWaiters.get(sessionPath) ?? new Set<PendingPortWaiter>();
    waiters.add(waiter);
    pendingPortWaiters.set(sessionPath, waiters);
  });
}

function resolvePendingPortWaiters(sessionPath: string): void {
  const waiters = pendingPortWaiters.get(sessionPath);
  if (!waiters) {
    return;
  }

  for (const waiter of waiters) {
    clearTimeout(waiter.timeoutId);
    waiter.resolve();
  }
  pendingPortWaiters.delete(sessionPath);
}

function cleanupSessionPort(sessionPath: string, clearPendingHandlers = true): void {
  const session = sessionPorts.get(sessionPath);
  if (session) {
    for (const pendingCommand of session.pending.values()) {
      clearTimeout(pendingCommand.timeoutId);
      pendingCommand.reject(new Error(SESSION_PORT_CLOSED_ERROR));
    }
    session.pending.clear();
    session.pushHandlers.clear();
    session.streamHandlers.clear();
    session.controlPort.close();
    session.dataPort.close();
    sessionPorts.delete(sessionPath);
  }

  if (clearPendingHandlers) {
    pendingPushHandlers.delete(sessionPath);
    pendingStreamHandlers.delete(sessionPath);
    cleanupPendingPortWaiters(sessionPath, new Error(SESSION_PORT_CLOSED_ERROR));
  }
}

function setupPort(sessionPath: string, controlPort: MessagePort, dataPort: MessagePort): void {
  cleanupSessionPort(sessionPath, false);

  const session: SessionPort = {
    controlPort,
    dataPort,
    pending: new Map(),
    pushHandlers: new Set(),
    streamHandlers: new Set(),
    requestId: 0,
  };

  controlPort.onmessage = (event) => {
    const data: ControlPortMessage = event.data;

    if (isPiResult(data)) {
      const pendingCommand = session.pending.get(data.id);
      if (pendingCommand) {
        clearTimeout(pendingCommand.timeoutId);
        session.pending.delete(data.id);
        pendingCommand.resolve(data.result);
      }
    }
  };

  function deliverPush(message: PiPush): void {
    for (const handler of session.pushHandlers) {
      handler(message);
    }
  }

  dataPort.onmessage = (event) => {
    const data: DataPortMessage = event.data;

    if (isStreamBatch(data)) {
      for (const handler of session.streamHandlers) {
        handler(data);
      }
      return;
    }

    if (isPiPush(data)) {
      deliverPush(data);
    }
  };

  sessionPorts.set(sessionPath, session);

  const queuedPushHandlers = pendingPushHandlers.get(sessionPath);
  if (queuedPushHandlers) {
    for (const callback of queuedPushHandlers) session.pushHandlers.add(callback);
    pendingPushHandlers.delete(sessionPath);
  }
  const queuedStreamHandlers = pendingStreamHandlers.get(sessionPath);
  if (queuedStreamHandlers) {
    for (const callback of queuedStreamHandlers) session.streamHandlers.add(callback);
    pendingStreamHandlers.delete(sessionPath);
  }

  controlPort.start();
  dataPort.start();
  resolvePendingPortWaiters(sessionPath);
}

// Receive session ports from main. ports[0] is low-volume control, ports[1] is data stream.
ipcRenderer.on(PiChannel.SessionPort, (event, data: { sessionPath: string }) => {
  const [controlPort, dataPort] = event.ports;
  if (!controlPort || !dataPort || !data?.sessionPath) return;
  setupPort(data.sessionPath, controlPort, dataPort);
});

const terminalPorts = new Map<string, MessagePort>();
const terminalExitNotified = new Set<string>();
const terminalOutputHandlers = new Map<string, Set<(data: string) => void>>();
const terminalExitHandlers = new Map<string, Set<(exitCode: number | null) => void>>();

function notifyTerminalExit(id: string, exitCode: number | null): void {
  if (terminalExitNotified.has(id)) return;
  terminalExitNotified.add(id);
  const handlers = terminalExitHandlers.get(id);
  if (handlers) for (const handler of handlers) handler(exitCode);
}

function setupTerminalPort(id: string, port: MessagePort): void {
  terminalPorts.get(id)?.close();
  terminalPorts.set(id, port);
  port.onmessage = (event) => {
    const message: TerminalOutboundMessage = event.data;
    if (message.type === 'output') {
      const handlers = terminalOutputHandlers.get(id);
      if (handlers) for (const handler of handlers) handler(message.data);
    } else if (message.type === 'exit') {
      notifyTerminalExit(id, message.exitCode);
    }
  };
  port.start();
}

ipcRenderer.on(PiChannel.TerminalPort, (event, payload: { id: string }) => {
  const [port] = event.ports;
  if (port) setupTerminalPort(payload.id, port);
});

ipcRenderer.on(PiChannel.TerminalExit, (_event, payload: { id: string }) => {
  terminalPorts.delete(payload.id);
  notifyTerminalExit(payload.id, null);
});

const piApi = {
  /** Create a new session. Resolves after the renderer-side ports are registered. */
  createSession: async (
    cwd: string,
    parentSessionPath?: string,
    options?: CreateSessionOptions,
  ): Promise<{ success: boolean; sessionPath?: string; error?: string }> => {
    const result: { success: boolean; sessionPath?: string; error?: string } =
      await ipcRenderer.invoke(PiChannel.CreateSession, cwd, parentSessionPath, options);
    if (result.success && result.sessionPath) {
      await waitForPort(result.sessionPath);
    }
    return result;
  },

  /** Resume an existing session by file path. Resolves after renderer-side ports are registered. */
  resumeSession: async (
    sessionPath: string,
  ): Promise<{ success: boolean; sessionPath?: string; error?: string }> => {
    const result: { success: boolean; sessionPath?: string; error?: string } =
      await ipcRenderer.invoke(PiChannel.ResumeSession, sessionPath);
    if (result.success && result.sessionPath) {
      await waitForPort(result.sessionPath);
    }
    return result;
  },

  destroySession: (sessionPath: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(PiChannel.DestroySession, sessionPath),

  /** Mark a session as recently selected. */
  touchSession: (sessionPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(PiChannel.TouchSession, sessionPath),

  getBusySessions: (): Promise<string[]> => ipcRenderer.invoke(PiChannel.GetBusySessions),

  getProjects: (): Promise<ProjectStateResult> => ipcRenderer.invoke(PiChannel.GetProjects),

  getGitBranch: (cwd: string): Promise<GitBranchResult> =>
    ipcRenderer.invoke(PiChannel.GetGitBranch, cwd),

  /** List changed files and commits for the Diff workspace. */
  getGitDiffSummary: (cwd: string, scope: GitDiffScope): Promise<GitDiffSummaryResult> =>
    ipcRenderer.invoke(PiChannel.GetGitDiffSummary, cwd, scope),

  /** Read one changed file's unified diff. */
  getGitDiffFile: (
    cwd: string,
    source: GitDiffSource,
    path: string,
    oldPath: string | null,
  ): Promise<GitDiffFileResult> =>
    ipcRenderer.invoke(PiChannel.GetGitDiffFile, cwd, source, path, oldPath),

  getGitCommitFiles: (cwd: string, commit: string): Promise<GitCommitFilesResult> =>
    ipcRenderer.invoke(PiChannel.GetGitCommitFiles, cwd, commit),

  /** List branches for the Git tab's base picker. */
  listGitBranches: (cwd: string): Promise<GitBranchListResult> =>
    ipcRenderer.invoke(PiChannel.ListGitBranches, cwd),

  /** Stage every change in the project, or unstage every staged one. */
  setGitStaged: (cwd: string, staged: boolean): Promise<GitStageResult> =>
    ipcRenderer.invoke(PiChannel.SetGitStaged, cwd, staged),

  /** List files visible to git for inline @ references. */
  searchProjectFiles: (
    cwd: string,
    query: string,
    limit?: number,
  ): Promise<ProjectFileSearchResult> =>
    ipcRenderer.invoke(PiChannel.SearchProjectFiles, cwd, query, limit),

  /** List directory entries that complete a typed path. */
  completePath: (cwd: string, token: string): Promise<PathCompletionResult> =>
    ipcRenderer.invoke(PiChannel.CompletePath, cwd, token),

  /** List one directory in the workspace file tree. */
  listProjectDirectory: (cwd: string, path: string): Promise<ProjectDirectoryResult> =>
    ipcRenderer.invoke(PiChannel.ListProjectDirectory, cwd, path),

  readProjectFile: (cwd: string, path: string): Promise<ProjectFileResult> =>
    ipcRenderer.invoke(PiChannel.ReadProjectFile, cwd, path),

  /** Each entry that names an existing file or directory, made absolute, else null. */
  resolveExistingPaths: (cwd: string, paths: string[]): Promise<(ExistingPath | null)[]> =>
    ipcRenderer.invoke(PiChannel.ResolveExistingPaths, cwd, paths),

  /** Replace the directories and active file watched for the Files workspace. */
  watchProjectFiles: (cwd: string, directories: string[], filePath: string | null): void => {
    ipcRenderer.send(PiChannel.WatchProjectFiles, cwd, directories, filePath);
  },

  onProjectFilesChanged: (callback: (change: ProjectFilesChanged) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, change: ProjectFilesChanged): void => {
      callback(change);
    };
    ipcRenderer.on(PiChannel.ProjectFilesChanged, handler);
    return () => ipcRenderer.removeListener(PiChannel.ProjectFilesChanged, handler);
  },

  setActiveProject: (path: string): Promise<ProjectStateResult> =>
    ipcRenderer.invoke(PiChannel.SetActiveProject, path),

  /** Open native directory picker and persist selected project directory. */
  openProjectDirectory: (): Promise<ProjectStateResult> =>
    ipcRenderer.invoke(PiChannel.OpenProjectDirectory),

  removeProject: (path: string): Promise<ProjectStateResult> =>
    ipcRenderer.invoke(PiChannel.RemoveProject, path),

  /** Open the native file picker for chat attachments. */
  pickAttachments: (kind: ChatAttachmentKind): Promise<PickAttachmentsResult> =>
    ipcRenderer.invoke(PiChannel.PickAttachments, kind),

  /** Resolve the on-disk path of a dropped or pasted File. Empty for JS-created files. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  reorderProjects: (paths: string[]): Promise<ProjectStateResult> =>
    ipcRenderer.invoke(PiChannel.ReorderProjects, paths),

  /** Rename a persisted (non-running) session by appending a session_info entry. */
  renamePersistedSession: (
    sessionPath: string,
    name: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(PiChannel.RenamePersistedSession, sessionPath, name),

  /** Read messages from a session file without spawning a utility process. */
  readSessionMessages: (
    sessionPath: string,
  ): Promise<{
    success: boolean;
    messages?: unknown[];
    compactionCount?: number;
    thinkingLevel?: string;
    model?: { provider: string; modelId: string } | null;
    cacheWarmEntries?: CacheWarmEntry[];
    error?: string;
  }> => ipcRenderer.invoke(PiChannel.ReadSessionMessages, sessionPath),

  listProjectSessions: (cwds: string[]): Promise<SessionListResult> =>
    ipcRenderer.invoke(PiChannel.ListProjectSessions, cwds),

  onProjectSessionsChunk: (callback: (chunk: ProjectSessionsChunk) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: ProjectSessionsChunk): void => {
      callback(chunk);
    };
    ipcRenderer.on(PiChannel.ProjectSessionsChunk, handler);
    return () => ipcRenderer.removeListener(PiChannel.ProjectSessionsChunk, handler);
  },

  /** Send a command to a session (via control MessagePort). Waits for port if not yet available. */
  send: async (sessionPath: string, command: PiCommand): Promise<unknown> => {
    let session = sessionPorts.get(sessionPath);
    if (!session) {
      await waitForPort(sessionPath);
      session = sessionPorts.get(sessionPath);
      if (!session) {
        return Promise.reject(
          new Error(`no port for session ${sessionPath} (port did not arrive)`),
        );
      }
    }
    const requestId = `req-${++session.requestId}`;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (session.pending.has(requestId)) {
          session.pending.delete(requestId);
          reject(new Error('command timed out'));
        }
      }, 60000);
      session.pending.set(requestId, { resolve, reject, timeoutId });
      const request: PiRequest = { id: requestId, cmd: command };
      session.controlPort.postMessage(request);
    });
  },

  onPush: (sessionPath: string, callback: (message: PiPush) => void): (() => void) => {
    const session = sessionPorts.get(sessionPath);
    if (session) {
      session.pushHandlers.add(callback);
    } else {
      if (!pendingPushHandlers.has(sessionPath)) {
        pendingPushHandlers.set(sessionPath, new Set());
      }
      pendingPushHandlers.get(sessionPath)!.add(callback);
    }
    return () => {
      const current = sessionPorts.get(sessionPath);
      if (current) current.pushHandlers.delete(callback);
      pendingPushHandlers.get(sessionPath)?.delete(callback);
    };
  },

  onStreamBatch: (sessionPath: string, callback: (batch: StreamBatch) => void): (() => void) => {
    const session = sessionPorts.get(sessionPath);
    if (session) {
      session.streamHandlers.add(callback);
    } else {
      if (!pendingStreamHandlers.has(sessionPath)) {
        pendingStreamHandlers.set(sessionPath, new Set());
      }
      pendingStreamHandlers.get(sessionPath)!.add(callback);
    }
    return () => {
      const current = sessionPorts.get(sessionPath);
      if (current) current.streamHandlers.delete(callback);
      pendingStreamHandlers.get(sessionPath)?.delete(callback);
    };
  },

  onProcessExit: (callback: (data: { sessionPath: string; code: number }) => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: { sessionPath: string; code: number },
    ): void => {
      cleanupSessionPort(data.sessionPath);
      callback(data);
    };
    ipcRenderer.on(PiChannel.ProcessExit, handler);
    return () => ipcRenderer.removeListener(PiChannel.ProcessExit, handler);
  },

  /** Get the cached model catalog snapshot. Updates arrive via onModelCatalogUpdated. */
  getModelCatalog: (): Promise<ModelCatalogSnapshot> =>
    ipcRenderer.invoke(PiChannel.GetModelCatalog),

  /** Kick a background catalog reload and get the current snapshot back immediately. */
  refreshModelCatalog: (): Promise<ModelCatalogSnapshot> =>
    ipcRenderer.invoke(PiChannel.RefreshModelCatalog),

  onModelCatalogUpdated: (callback: (snapshot: ModelCatalogSnapshot) => void) => {
    const handler = (_: Electron.IpcRendererEvent, snapshot: ModelCatalogSnapshot): void => {
      callback(snapshot);
    };
    ipcRenderer.on(PiChannel.ModelCatalogUpdated, handler);
    return () => ipcRenderer.removeListener(PiChannel.ModelCatalogUpdated, handler);
  },

  /** Get the app's working directory (for session creation). */
  getCwd: (): string => process.cwd(),

  /** Read pi settings (global + project) for a project cwd. */
  getPiSettings: (cwd: string): Promise<PiSettingsResult> =>
    ipcRenderer.invoke(PiChannel.GetPiSettings, cwd),

  /** Write pi setting fields in one scope (atomic batch). `null` clears a field. */
  setPiSettings: (
    cwd: string,
    scope: PiSettingsScope,
    updates: PiSettingUpdate[],
  ): Promise<PiSettingsResult> => ipcRenderer.invoke(PiChannel.SetPiSettings, cwd, scope, updates),

  /** Installed pi packages; `cwd` adds the project's, null lists the user's only. */
  listPiPackages: (cwd: string | null): Promise<PiPackagesResult> =>
    ipcRenderer.invoke(PiChannel.ListPiPackages, cwd),

  checkPiPackages: (cwd: string | null): Promise<PiPackagesHealthResult> =>
    ipcRenderer.invoke(PiChannel.CheckPiPackages, cwd),

  runPiPackageOperation: (
    cwd: string | null,
    operation: PiPackageOperation,
  ): Promise<PiPackageOperationResult> =>
    ipcRenderer.invoke(PiChannel.RunPiPackageOperation, cwd, operation),

  pickPackageFolder: (): Promise<string | null> => ipcRenderer.invoke(PiChannel.PickPackageFolder),

  searchPiPackageCatalog: (query: string): Promise<CatalogSearchResult> =>
    ipcRenderer.invoke(PiChannel.SearchPiPackageCatalog, query),

  getPiCatalogPackage: (name: string): Promise<CatalogPackageDetailResult> =>
    ipcRenderer.invoke(PiChannel.GetPiCatalogPackage, name),

  openExternal: (url: string): void => {
    ipcRenderer.send(PiChannel.OpenExternal, url);
  },

  /** Preview an attached file: Quick Look on macOS, reveal in the file manager elsewhere. */
  previewFile: (path: string): void => {
    ipcRenderer.send(PiChannel.PreviewFile, path);
  },

  /** Get all keyboard shortcut definitions with current bindings. */
  getShortcuts: (): Promise<ShortcutDefinition[]> => ipcRenderer.invoke(PiChannel.GetShortcuts),

  setShortcut: (
    id: string,
    binding: ShortcutBinding,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(PiChannel.SetShortcut, id, binding),

  /** Tell the main process which theme is applied, so window materials match. */
  setAppearanceTheme: (theme: 'system' | 'light' | 'dark'): void => {
    ipcRenderer.send(PiChannel.SetAppearanceTheme, theme);
  },

  /**
   * pigi's own settings, read from disk synchronously.
   *
   * The renderer applies appearance before its first paint, so an async round
   * trip would paint one frame with the fallback palette. A missing file and an
   * unreadable one are reported differently: only the first may be replaced with
   * the value the app used to keep in localStorage.
   */
  readPigiSettings: (): PigiSettingsReadResult => {
    if (!pigiSettingsPath) {
      return { state: PIGI_SETTINGS_READ_STATE.missing };
    }
    try {
      return {
        state: PIGI_SETTINGS_READ_STATE.ok,
        settings: JSON.parse(readFileSync(pigiSettingsPath, 'utf8')),
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        return { state: PIGI_SETTINGS_READ_STATE.missing };
      }
      console.error('Failed to read pigi settings:', error);
      return { state: PIGI_SETTINGS_READ_STATE.corrupt };
    }
  },

  /**
   * Ask the main process to apply the changed slices to pigi's settings.
   *
   * Main owns the file: it merges the change onto its copy and writes it. The
   * renderer already applied the same change locally, so there is no snapshot
   * to hand back; the promise is how a caller knows the write landed.
   */
  changePigiSettings: (change: PigiSettingsChange): Promise<void> =>
    ipcRenderer.invoke(PiChannel.ChangePigiSettings, change),

  reportTelemetry: (report: RendererTelemetryReport): void => {
    ipcRenderer.send(PiChannel.ReportTelemetry, report);
  },

  /** Auto-update. Every renderer gets the status pushed on change. */
  update: {
    /** Current status, for a window that opened after the change. */
    getStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(PiChannel.GetUpdateStatus),
    /** Check now; a found update downloads and shows the progress window. */
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke(PiChannel.CheckForUpdates),
    /** Abort an in-flight download and close the progress window. */
    cancelDownload: (): void => {
      ipcRenderer.send(PiChannel.CancelUpdateDownload);
    },
    /** Close the progress window, leaving any finished download in place. */
    dismissWindow: (): void => {
      ipcRenderer.send(PiChannel.DismissUpdateWindow);
    },
    quitAndInstall: (): void => {
      ipcRenderer.send(PiChannel.QuitAndInstallUpdate);
    },
    /**
     * Tell main how tall the content is, from the progress window only. Main
     * sizes the window to it; the main window never calls this.
     */
    setProgressWindowContentHeight: (height: number): void => {
      ipcRenderer.send(PiChannel.UpdateProgressContentHeight, height);
    },
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: UpdateStatus): void => {
        callback(status);
      };
      ipcRenderer.on(PiChannel.UpdateStatusChanged, handler);
      return () => ipcRenderer.removeListener(PiChannel.UpdateStatusChanged, handler);
    },
  },

  /** The `pigi` CLI's requests, relayed by main (docs/cli.md §3). */
  remoteControl: {
    onCommand: (callback: (request: RemoteCommandRequest) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, request: RemoteCommandRequest): void => {
        callback(request);
      };
      ipcRenderer.on(PiChannel.RemoteCommand, handler);
      return () => ipcRenderer.removeListener(PiChannel.RemoteCommand, handler);
    },
    onCancel: (callback: (requestId: number) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: { requestId: number }): void => {
        callback(payload.requestId);
      };
      ipcRenderer.on(PiChannel.RemoteCommandCancel, handler);
      return () => ipcRenderer.removeListener(PiChannel.RemoteCommandCancel, handler);
    },
    send: (output: RemoteCommandOutput): void => {
      ipcRenderer.send(PiChannel.RemoteCommandOutput, output);
    },
    ready: (): void => {
      ipcRenderer.send(PiChannel.RemoteControlReady);
    },
  },

  /** Bottom-panel terminals. One PTY per tab (keyed by id); I/O over a MessagePort. */
  terminal: {
    /** Ensure the terminal process for `id` is running (shell in `cwd`) and (re)deliver its data port. */
    start: (id: string, cwd: string, cols: number, rows: number): Promise<{ success: boolean }> => {
      terminalExitNotified.delete(id);
      return ipcRenderer.invoke(PiChannel.TerminalStart, id, cwd, cols, rows);
    },
    /** Kill the terminal process for `id` (tab close / LRU / TTL eviction). */
    stop: (id: string): void => {
      terminalPorts.get(id)?.close();
      terminalPorts.delete(id);
      terminalOutputHandlers.delete(id);
      terminalExitHandlers.delete(id);
      terminalExitNotified.delete(id);
      void ipcRenderer.invoke(PiChannel.TerminalStop, id);
    },
    write: (id: string, data: string): void => {
      const message: TerminalInboundMessage = { type: 'input', data };
      terminalPorts.get(id)?.postMessage(message);
    },
    resize: (id: string, cols: number, rows: number): void => {
      const message: TerminalInboundMessage = { type: 'resize', cols, rows };
      terminalPorts.get(id)?.postMessage(message);
    },
    onData: (id: string, callback: (data: string) => void): (() => void) => {
      let handlers = terminalOutputHandlers.get(id);
      if (!handlers) {
        handlers = new Set();
        terminalOutputHandlers.set(id, handlers);
      }
      handlers.add(callback);
      return () => terminalOutputHandlers.get(id)?.delete(callback);
    },
    /** Subscribe to a terminal's exit (shell exited or process gone). */
    onExit: (id: string, callback: (exitCode: number | null) => void): (() => void) => {
      let handlers = terminalExitHandlers.get(id);
      if (!handlers) {
        handlers = new Set();
        terminalExitHandlers.set(id, handlers);
      }
      handlers.add(callback);
      return () => terminalExitHandlers.get(id)?.delete(callback);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);
contextBridge.exposeInMainWorld('piApi', piApi);
