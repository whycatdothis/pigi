import { ElectronAPI } from '@electron-toolkit/preload';
import type { PigiSettingsChange, PigiSettingsReadResult } from '../shared/pigiSettings';
import type {
  PiCommand,
  PiPush,
  GitBranchResult,
  ModelCatalogSnapshot,
  PickAttachmentsResult,
  ChatAttachmentKind,
  ProjectSessionsChunk,
  ProjectFileSearchResult,
  PathCompletionResult,
  ProjectStateResult,
  SessionListResult,
  ShortcutBinding,
  ShortcutDefinition,
  StreamBatch,
  UpdateStatus,
} from '../shared/ipcContract';
import type { PiSettingsResult, PiSettingsScope, PiSettingUpdate } from '../shared/piSettings';

interface PiApi {
  // Session lifecycle (via main process IPC)
  createSession: (
    cwd: string,
    parentSessionPath?: string,
  ) => Promise<{ success: boolean; sessionPath?: string; error?: string }>;
  resumeSession: (
    sessionPath: string,
  ) => Promise<{ success: boolean; sessionPath?: string; error?: string }>;
  destroySession: (sessionPath: string) => Promise<{ success: boolean }>;
  touchSession: (sessionPath: string) => Promise<{ success: boolean; error?: string }>;

  // Project directories
  getProjects: () => Promise<ProjectStateResult>;
  getGitBranch: (cwd: string) => Promise<GitBranchResult>;
  searchProjectFiles: (cwd: string, query: string) => Promise<ProjectFileSearchResult>;
  completePath: (cwd: string, token: string) => Promise<PathCompletionResult>;
  setActiveProject: (path: string) => Promise<ProjectStateResult>;
  openProjectDirectory: () => Promise<ProjectStateResult>;
  removeProject: (path: string) => Promise<ProjectStateResult>;
  reorderProjects: (paths: string[]) => Promise<ProjectStateResult>;
  pickAttachments: (kind: ChatAttachmentKind) => Promise<PickAttachmentsResult>;
  getPathForFile: (file: File) => string;
  renamePersistedSession: (
    sessionPath: string,
    name: string,
  ) => Promise<{ success: boolean; error?: string }>;
  readSessionMessages: (sessionPath: string) => Promise<{
    success: boolean;
    messages?: unknown[];
    compactionCount?: number;
    thinkingLevel?: string;
    model?: { provider: string; modelId: string } | null;
    error?: string;
  }>;
  listProjectSessions: (cwds: string[]) => Promise<SessionListResult>;
  onProjectSessionsChunk: (callback: (chunk: ProjectSessionsChunk) => void) => () => void;

  // Commands (via control MessagePort, direct to utility)
  send: (sessionPath: string, command: PiCommand) => Promise<unknown>;

  // Subscriptions (via data MessagePort)
  onPush: (sessionPath: string, callback: (message: PiPush) => void) => () => void;
  onStreamBatch: (sessionPath: string, callback: (batch: StreamBatch) => void) => () => void;

  // Process lifecycle
  onProcessExit: (callback: (data: { sessionPath: string; code: number }) => void) => () => void;

  // Utilities
  getCwd: () => string;
  openExternal: (url: string) => void;
  previewFile: (path: string) => void;
  getModelCatalog: () => Promise<ModelCatalogSnapshot>;
  refreshModelCatalog: () => Promise<ModelCatalogSnapshot>;
  onModelCatalogUpdated: (callback: (snapshot: ModelCatalogSnapshot) => void) => () => void;

  // Pi settings (settings.json)
  getPiSettings: (cwd: string) => Promise<PiSettingsResult>;
  setPiSettings: (
    cwd: string,
    scope: PiSettingsScope,
    updates: PiSettingUpdate[],
  ) => Promise<PiSettingsResult>;

  // Keyboard shortcuts
  getShortcuts: () => Promise<ShortcutDefinition[]>;
  setShortcut: (
    id: string,
    binding: ShortcutBinding,
  ) => Promise<{ success: boolean; error?: string }>;
  setAppearanceTheme: (theme: 'system' | 'light' | 'dark') => void;
  /** pigi's own settings, read synchronously so the first paint can use them. */
  readPigiSettings: () => PigiSettingsReadResult;
  /** Apply appearance/chat slices; resolves with the merged snapshot. */
  changePigiSettings: (change: PigiSettingsChange) => Promise<void>;
  /** Follow the merged snapshot of every change; returns an unsubscribe. */

  // Auto-update
  update: {
    getStatus: () => Promise<UpdateStatus>;
    check: () => Promise<UpdateStatus>;
    cancelDownload: () => void;
    dismissWindow: () => void;
    quitAndInstall: () => void;
    setProgressWindowContentHeight: (height: number) => void;
    onStatus: (callback: (status: UpdateStatus) => void) => () => void;
  };

  // Bottom-panel terminals (one PTY per tab, keyed by id, I/O over a MessagePort each)
  terminal: {
    start: (id: string, cwd: string, cols: number, rows: number) => Promise<{ success: boolean }>;
    stop: (id: string) => void;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    onData: (id: string, callback: (data: string) => void) => () => void;
    onExit: (id: string, callback: (exitCode: number | null) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    piApi: PiApi;
  }
}
