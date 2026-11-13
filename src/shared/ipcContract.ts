import type {
  EditToolInput,
  WriteToolInput,
  AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import type { PiSettingsResult, PiSettingsScope, PiSettingUpdate } from './piSettings.ts';
import type {
  PiPackageOperation,
  PiPackageOperationResult,
  PiPackagesHealthResult,
  PiPackagesResult,
} from './piPackages.ts';

/**
 * IPC Contract - single source of truth for all inter-process communication.
 *
 * Architecture:
 *   One utility process per session.
 *   Renderer ←(control/data MessagePorts)→ Utility Process (1:1 with session)
 *   Main only handles: process lifecycle + port handshake
 *
 * Flow:
 *   1. Renderer invokes create/resume on main
 *   2. Main spawns a new utility process, sends lifecycle command
 *   3. Utility creates session, reports back real sessionId
 *   4. Main creates MessageChannels, distributes ports, returns sessionId
 *   5. Runtime communication flows over dedicated control/data MessagePorts
 */

// =============================================================================
// Shared Data Types
// =============================================================================

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { RemoteMethod } from './remoteCommandContract';

export type { ThinkingLevel };

export interface ModelInfo {
  name: string;
  provider: string;
  id: string;
  api: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  thinkingLevels: ThinkingLevel[];
}

/**
 * Versioned catalog snapshot. The version breaks the race between an invoke
 * reply (GetModelCatalog / RefreshModelCatalog) and a newer push arriving
 * first: the renderer drops any snapshot whose version is not newer than the
 * one it already applied.
 */
export interface ModelCatalogSnapshot {
  version: number;
  models: ModelInfo[];
}

export interface ProjectDirectory {
  path: string;
  name: string;
}

export type ChatAttachmentKind = 'image' | 'file';

/**
 * Attachment sent with a prompt.
 *
 * Images travel as provider image content; other files are referenced by
 * absolute path so the agent can read them with its tools. Content pasted
 * from the clipboard (no path on disk) is carried as base64 `data`.
 */
export interface PromptAttachment {
  kind: ChatAttachmentKind;
  name: string;
  mimeType: string;
  /** Absolute path on disk. */
  path?: string;
  /** Base64-encoded bytes (no data: prefix) for clipboard content. */
  data?: string;
}

/** A message as the user wrote it, before the utility builds prompt text. */
export interface PromptInput {
  message: string;
  attachments: PromptAttachment[];
}

/** Queued messages handed back by `clear_queue`, in queue order. */
export interface ClearedQueue {
  steering: PromptInput[];
  followUp: PromptInput[];
}

/** One file returned by the native attachment picker. */
export interface PickedAttachment {
  path: string;
  name: string;
  size: number;
  mimeType: string;
  kind: ChatAttachmentKind;
}

export type PickAttachmentsResult =
  | { success: true; files: PickedAttachment[] }
  | { success: false; canceled?: boolean; error?: string };

/** Best matches for an inline @ file reference query in the chat input. */
export type ProjectFileSearchResult =
  | { success: true; files: string[] }
  | { success: false; error: string };

/** One filesystem entry offered while completing a typed path. */
export interface PathCompletionEntry {
  /** Base name, shown in the picker and the chip. */
  name: string;
  /** Absolute path, stored in the chip and sent as prompt text. */
  path: string;
  isDirectory: boolean;
}

export type PathCompletionResult =
  | { success: true; entries: PathCompletionEntry[] }
  | { success: false; error: string };

/** One child of a directory in the workspace file tree. */
export interface ProjectDirectoryEntry {
  name: string;
  /** Path relative to the project root, `/` separated. */
  path: string;
  isDirectory: boolean;
}

/** A path named in chat that exists on disk, made absolute. */
export interface ExistingPath {
  path: string;
  isDirectory: boolean;
}

export type ProjectDirectoryResult =
  | { success: true; entries: ProjectDirectoryEntry[]; truncated: boolean }
  | { success: false; error: string };

/** A text file read for the workspace file viewer. */
export type ProjectFileResult =
  | { success: true; content: string; size: number; truncated: boolean }
  | { success: false; error: string };

/** A filesystem change the Files workspace needs to reread. */
export interface ProjectFilesChanged {
  cwd: string;
  /** Project-relative directories whose immediate entries changed. */
  directories: string[];
  /** The active file, when its contents or path changed. */
  filePath: string | null;
}

export interface ProjectState {
  recentProjects: ProjectDirectory[];
  activeProject: ProjectDirectory | null;
}

export type GitBranchResult =
  | { success: true; branch: string | null; detached: boolean }
  | { success: false; error?: string };

export type GitDiffFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechanged'
  | 'conflicted'
  | 'untracked';

export interface GitDiffFile {
  path: string;
  /** The pre-rename path, when Git detected a rename or copy. */
  oldPath: string | null;
  status: GitDiffFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface GitDiffBranch {
  name: string;
  current: boolean;
  local: boolean;
}

export interface GitDiffCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

/**
 * What the Git tab shows: everything since a base (the default branch unless
 * one is picked), only what is not committed yet, only the last commit, or
 * Git status (the staged and unstaged lists, nothing else).
 */
export type GitDiffScope =
  | { kind: 'branch'; base: string | null }
  | { kind: 'uncommitted' }
  | { kind: 'lastCommit' }
  | { kind: 'status' };

export interface GitDiffSummary {
  branch: string | null;
  detached: boolean;
  /** The ref or hash the comparison starts from. */
  base: string;
  baseLabel: string;
  /**
   * The repository's main branch, preferring the remote's (`origin/main`,
   * `origin/trunk`); null for Git status, which has no mode menu to name it in.
   */
  defaultBase: string | null;
  /** How each file's patch is read. */
  source: GitDiffSource;
  /** Commits on HEAD since the merge-base, newest first, capped. */
  commits: GitDiffCommit[];
  /** More commits exist past the cap. */
  moreCommits: boolean;
  /** History from the merge-base down, newest first. */
  baseCommits: GitDiffCommit[];
  /** Empty for Git status, which lists `staged` and `unstaged` instead. */
  files: GitDiffFile[];
  /** The index against HEAD. Only filled for Git status. */
  staged: GitDiffFile[];
  /** The working tree against the index, untracked files included. Only filled for Git status. */
  unstaged: GitDiffFile[];
}

/**
 * What a file diff compares: the merge-base against the working tree, one
 * commit against its first parent, or one side of the index.
 */
export type GitDiffSource =
  | { kind: 'base'; base: string }
  | { kind: 'commit'; commit: string }
  | { kind: 'staged' }
  | { kind: 'unstaged' };

export type GitBranchListResult =
  | { success: true; branches: GitDiffBranch[] }
  | { success: false; error: string };

export type GitStageResult = { success: true } | { success: false; error: string };

export type GitCommitFilesResult =
  | { success: true; files: GitDiffFile[] }
  | { success: false; error: string };

export type GitDiffSummaryResult =
  | { success: true; summary: GitDiffSummary }
  | { success: false; error: string };

/** Lines a diff renders at most: a longer patch is cut, and a longer file is not offered whole. */
export const MAX_DIFF_LINES = 5000;

export type GitDiffFileResult =
  | {
      success: true;
      patch: string;
      truncated: boolean;
      /**
       * The file after the change, for expanding unchanged lines; null when
       * deleted, binary, too large, or the patch is truncated (its last gap
       * would run over changes the patch left out).
       */
      newContent: string | null;
    }
  | { success: false; error: string };

export type ProjectStateResult =
  | ({ success: true } & ProjectState)
  | { success: false; error?: string; canceled?: boolean };

export interface PiSessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  /** Started by `pigi subagent` (docs/cli.md §10). */
  isSubagent?: boolean;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  allMessagesText: string;
}

export type SessionListResult =
  | { success: true; requestId: string }
  | { success: false; error?: string };

export interface ProjectSessionsChunk {
  requestId: string;
  cwd: string;
  success: boolean;
  sessions?: PiSessionInfo[];
  error?: string;
}

export interface SessionState {
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel | null;
  isStreaming: boolean;
  sessionFile: string | undefined;
  sessionId: string;
  cwd: string;
  parentSessionPath: string | undefined;
  /** Started by `pigi subagent` (docs/cli.md §10). */
  isSubagent: boolean;
  messageCount: number;
  contextUsage: ContextUsage | null;
  autoCompactionEnabled: boolean;
  compactionCount: number;
}

export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface SkillSlashCommand {
  name: string;
  description: string;
}

// =============================================================================
// Session tree
// =============================================================================

/** One row in the session tree dialog. */
export interface SessionTreeEntry {
  id: string;
  /** Nearest *visible* ancestor, not necessarily the raw entry parent. */
  parentId: string | null;
  /** Entry timestamp (epoch ms), used for ordering. */
  timestamp: number;
  kind: 'user' | 'assistant' | 'toolResult' | 'compaction' | 'branchSummary';
  /** Single-line, already truncated summary for the row. */
  preview: string;
  /** `message.timestamp` of the message entry. Transcript nodes match on
   *  (kind, messageTimestamp) to resolve a row back to its entry id. */
  messageTimestamp?: number;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  isError?: boolean;
  tokensBefore?: number;
  stopReason?: string;
}

export interface SessionTree {
  /** The SDK's real leaf. It can be an entry that is not a row (a model
   *  change, an assistant message cut off mid-tool-call). */
  leafId: string | null;
  /** The row that stands for the leaf: `leafId` or its nearest row ancestor. */
  visibleLeafId: string | null;
  entries: SessionTreeEntry[];
}

export interface EntryTextResult {
  success: boolean;
  text: string;
  /** True when the entry text was clipped for transport. */
  truncated: boolean;
  error?: string;
}

export interface ForkSessionResult {
  success: boolean;
  /** The new session file. Absent when the SDK has nothing to fork yet. */
  sessionPath?: string;
  /** Input box content for the new session (forking before a user message). */
  editorInput?: PromptInput;
  /** Attachments of that message that cannot come back (sent as a status line only). */
  droppedFileNames?: string[];
  /** No file to fork: the caller creates an empty session with this one as its
   *  parent. */
  needsNewSession?: boolean;
  error?: string;
}

export interface NavigateSessionTreeResult {
  success: boolean;
  /** The user aborted the branch summary (or the SDK refused the move). */
  cancelled: boolean;
  aborted?: boolean;
  /** What goes back in the input box (navigating to a user message). */
  editorInput?: PromptInput;
  /** Attachments of that message that cannot come back (sent as a status line only). */
  droppedFileNames?: string[];
  error?: string;
}

export interface SessionOptions {
  /**
   * Session-scoped models (empty when the session uses the global catalog).
   * Scoped models are authoritative for the picker; when empty, the renderer
   * falls back to the main-process model catalog (see GetModelCatalog /
   * ModelCatalogUpdated).
   */
  models: ModelInfo[];
  thinkingLevels: ThinkingLevel[];
  skills: SkillSlashCommand[];
}

// =============================================================================
// Commands: Renderer → Utility (via control MessagePort, after handshake)
// =============================================================================

export interface AuthProviderInfo {
  id: string;
  name: string;
  hasAuth: boolean;
  authStatus: { configured: boolean; source?: string; label?: string };
  authType: 'oauth' | 'api_key';
}

export type PiCommand =
  | { type: 'prompt'; message: string; attachments?: PromptAttachment[] }
  | { type: 'steer'; message: string; attachments?: PromptAttachment[] }
  | { type: 'follow_up'; message: string; attachments?: PromptAttachment[] }
  | { type: 'abort' }
  | { type: 'clear_queue' }
  | { type: 'compact' }
  | { type: 'reload' }
  | { type: 'get_state' }
  | { type: 'get_session_options' }
  | { type: 'get_messages' }
  | { type: 'get_session_tree' }
  | { type: 'get_entry_text'; entryId: string }
  | {
      type: 'navigate_session_tree';
      targetId: string;
      summarize: boolean;
      customInstructions?: string;
    }
  | { type: 'abort_branch_summary' }
  | { type: 'fork_session'; entryId: string; position: 'before' | 'at' }
  | { type: 'list_sessions'; cwd?: string }
  | { type: 'cycle_model' }
  | { type: 'cycle_thinking_level' }
  | { type: 'set_model'; provider: string; modelId: string }
  | { type: 'set_thinking_level'; level: ThinkingLevel }
  | { type: 'rename_session'; name: string }
  | { type: 'get_auth_providers' }
  | { type: 'login_oauth'; providerId: string }
  | { type: 'login_api_key'; providerId: string; apiKey: string }
  | { type: 'logout'; providerId: string }
  | { type: 'debug' };

/** Wire format for a command request (renderer → utility via port) */
export interface PiRequest {
  id: string;
  cmd: PiCommand;
}

/** Wire format for a command response (utility → renderer via port) */
export interface PiResult {
  id: string;
  result: unknown;
}

// =============================================================================
// Push events: Utility → Renderer (via data MessagePort, no request ID)
// =============================================================================

export type PiPush =
  | {
      type: 'session_ready';
      model: ModelInfo | null;
      thinkingLevel: ThinkingLevel | null;
      contextUsage: ContextUsage | null;
      autoCompactionEnabled: boolean;
    }
  | { type: 'session_error'; error: string }
  | { type: 'event'; event: AgentSessionEvent }
  | { type: 'error'; error: string }
  | { type: 'status_sync'; isStreaming: boolean }
  | { type: 'login_open_url'; url: string }
  | { type: 'login_device_code'; verificationUri: string; userCode: string }
  | { type: 'login_progress'; message: string }
  | { type: 'login_complete'; providerId: string }
  | { type: 'login_error'; error: string }
  | { type: 'auto_title'; title: string; cwd: string }
  | { type: 'extension_notify'; message: string; level: 'info' | 'warning' | 'error' };

// =============================================================================
// Stream batches: Utility → Renderer (via data MessagePort, high-frequency)
// =============================================================================

export type StreamBatchToolArgs =
  | { name: 'write'; args: Partial<WriteToolInput> }
  | { name: 'edit'; args: Pick<EditToolInput, 'path'> };

/** Batched streaming data, flushed every 16ms */
export interface StreamBatch {
  type: 'stream_batch';
  text?: string;
  thinking?: string;
  toolOutput?: Record<string, string>;
  /** Partial tool details, last write wins; codemode publishes its calls this way. */
  toolDetails?: Record<string, Record<string, unknown>>;
  toolArgs?: Record<string, StreamBatchToolArgs>;
}

// =============================================================================
// Port messages
// =============================================================================

/** Low-volume control port: renderer → utility commands and utility → renderer responses. */
export type ControlPortMessage = PiRequest | PiResult;

/** High-volume data port: utility → renderer push events and stream batches. */
export type DataPortMessage = PiPush | StreamBatch;

export type PortMessage = ControlPortMessage | DataPortMessage;

// =============================================================================
// Type guards for discriminated union narrowing
// =============================================================================

export function isPiResult(message: ControlPortMessage): message is PiResult {
  return 'id' in message && 'result' in message;
}

export function isPiRequest(message: ControlPortMessage): message is PiRequest {
  return 'id' in message && 'cmd' in message;
}

export function isStreamBatch(message: DataPortMessage): message is StreamBatch {
  return message.type === 'stream_batch';
}

export function isPiPush(message: DataPortMessage): message is PiPush {
  return 'type' in message && message.type !== 'stream_batch';
}

// =============================================================================
// Auto-update
// =============================================================================

/**
 * Where the auto-updater stands, as every renderer sees it.
 *
 * `unsupported` covers builds electron-updater cannot replace: a dev run, or a
 * platform with no publish target. Settings still offers the check and reports
 * the refusal, rather than hiding a menu entry that silently does nothing.
 */
export type UpdateStatus =
  | { phase: 'unsupported' }
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up_to_date' }
  | {
      phase: 'downloading';
      version: string;
      percent: number;
      transferredBytes: number;
      totalBytes: number;
    }
  | { phase: 'downloaded'; version: string }
  /** The user asked to install; Squirrel is re-fetching before it replaces the app. */
  | { phase: 'installing'; version: string }
  | { phase: 'error'; message: string };

// =============================================================================
// IPC Channels (only used for lifecycle via main process)
// =============================================================================

/** Where the `pigi` command stands on the PATH of terminals outside pigi (docs/cli.md §11). */
export type CliInstallStatus =
  /** The link exists and points at this bundle's launcher. */
  | 'installed'
  /** A link to this bundle, whose target is gone (the app moved). */
  | 'broken'
  /** Nothing at the path. */
  | 'not-installed'
  /** The path holds a file or a link some other program owns. */
  | 'conflict'
  /** No install is possible from this build or platform; `reason` says why. */
  | 'unsupported';

export interface CliInstallState {
  status: CliInstallStatus;
  /** Where the command goes, or would go. */
  path: string;
  /** What the path is a link to now, when it is a link. */
  target: string | null;
  /** Why it cannot be installed here, when the status is unsupported. */
  reason?: string;
}

export interface CliInstallResult {
  /** After the attempt: what the install path holds now. */
  state: CliInstallState;
  /** Why it failed, or that the user cancelled; absent on success and on a no-op. */
  error?: string;
}

/** A feature a person used: a workspace tab they switched to, a shortcut they pressed. */
export type TelemetryFeature = `tab.${string}` | `shortcut.${string}`;

/**
 * What a renderer tells main for telemetry. Main owns the queue, the opt-out and
 * the install id, so a renderer only reports that something happened.
 */
export type RendererTelemetryReport =
  | { type: 'prompt_sent' }
  | { type: 'feature_used'; feature: TelemetryFeature }
  | { type: 'exception'; name: string; message: string; stack?: string };

export enum PiChannel {
  /** renderer → main: create a new session (spawns process, returns real sessionId + port) */
  CreateSession = 'pi:create_session',
  /** renderer → main: resume an existing session */
  ResumeSession = 'pi:resume_session',
  /** renderer → main: destroy a session (kills process) */
  DestroySession = 'pi:destroy_session',
  /** renderer → main: mark a session as recently selected */
  TouchSession = 'pi:touch_session',
  /** renderer → main: the sessions whose process is running a turn */
  GetBusySessions = 'pi:get_busy_sessions',
  /** main → renderer: deliver control/data MessagePorts for a session */
  SessionPort = 'pi:session_port',
  /** main → renderer: a session's process exited unexpectedly */
  ProcessExit = 'pi:process_exit',
  /** renderer → main: get persisted project cwd state */
  GetProjects = 'pi:get_projects',
  /** renderer → main: set active project cwd from recent project list */
  SetActiveProject = 'pi:set_active_project',
  /** renderer → main: open a native directory picker for project cwd selection */
  OpenProjectDirectory = 'pi:open_project_directory',
  /** renderer → main: list persisted pi sessions for a project cwd */
  ListProjectSessions = 'pi:list_project_sessions',
  /** main → renderer: persisted pi sessions for one project cwd */
  ProjectSessionsChunk = 'pi:project_sessions_chunk',
  /** renderer → main: get current git branch for a cwd */
  GetGitBranch = 'pi:get_git_branch',
  /** renderer → main: list changed files and commits for the Git tab */
  GetGitDiffSummary = 'pi:get_git_diff_summary',
  /** renderer → main: read one changed file's unified diff */
  GetGitDiffFile = 'pi:get_git_diff_file',
  /** renderer → main: list the files one commit changed */
  GetGitCommitFiles = 'pi:get_git_commit_files',
  /** renderer → main: list branches for the Git tab's base picker */
  ListGitBranches = 'pi:list_git_branches',
  /** renderer → main: stage, or unstage, every change in the project */
  SetGitStaged = 'pi:set_git_staged',
  /** renderer → main: remove a project from recent projects list */
  RemoveProject = 'pi:remove_project',
  /** renderer → main: reorder recent projects */
  ReorderProjects = 'pi:reorder_projects',
  /** renderer → main: rename a persisted (non-running) session */
  RenamePersistedSession = 'pi:rename_persisted_session',
  /** renderer → main: read messages from a session file without spawning a utility process */
  ReadSessionMessages = 'pi:read_session_messages',
  /** renderer → main: open a URL in the system browser */
  OpenExternal = 'pi:open_external',
  /** renderer → main: open a native picker for chat attachments */
  PickAttachments = 'pi:pick_attachments',
  /** renderer → main: preview an attached file (Quick Look on macOS) */
  PreviewFile = 'pi:preview_file',
  /** renderer → main: list git-visible files for inline @ references */
  SearchProjectFiles = 'pi:search_project_files',
  /** renderer → main: list directory entries for inline path completion */
  CompletePath = 'pi:complete_path',
  /** renderer → main: list one directory in the workspace file tree */
  ListProjectDirectory = 'pi:list_project_directory',
  /** renderer → main: replace the watched directories and active file for a project */
  WatchProjectFiles = 'pi:watch_project_files',
  /** main → renderer: a watched directory or the active file changed */
  ProjectFilesChanged = 'pi:project_files_changed',
  /** renderer → main: read a project file for the workspace viewer */
  ReadProjectFile = 'pi:read_project_file',
  /** renderer → main: which paths named in chat exist */
  ResolveExistingPaths = 'pi:resolve_existing_paths',
  /** renderer → main: the app theme, so window materials follow it */
  SetAppearanceTheme = 'pi:set_appearance_theme',
  /** renderer → main: apply the changed slices to pigi's settings */
  ChangePigiSettings = 'pi:change_pigi_settings',
  /** renderer → main: a prompt, a feature used or an uncaught error, for telemetry (main decides whether to send) */
  ReportTelemetry = 'pi:report_telemetry',
  /** renderer → main: get all keyboard shortcut definitions with current bindings */
  GetShortcuts = 'pi:get_shortcuts',
  /** renderer → main: update a keyboard shortcut binding */
  SetShortcut = 'pi:set_shortcut',
  /** renderer → main: read pi settings (global + project) for a project cwd */
  GetPiSettings = 'pi:get_pi_settings',
  /** renderer → main: write pi settings fields in one scope (atomic batch) */
  SetPiSettings = 'pi:set_pi_settings',
  /** renderer → main: installed pi packages and loose resources for a project (or none) */
  ListPiPackages = 'pi:list_pi_packages',
  /** renderer → main: available updates and extension load errors (slow: network, loads code) */
  CheckPiPackages = 'pi:check_pi_packages',
  /** renderer → main: install, remove or update one package; operations run one at a time */
  RunPiPackageOperation = 'pi:run_pi_package_operation',
  /** renderer → main: a folder picked in the system dialog to install as a package, or null */
  PickPackageFolder = 'pi:pick_package_folder',
  /** renderer → main: search the npm registry for pi packages */
  SearchPiPackageCatalog = 'pi:search_pi_package_catalog',
  /** renderer → main: one catalog package's README and manifest */
  GetPiCatalogPackage = 'pi:get_pi_catalog_package',
  /** renderer → main: get the cached model catalog snapshot */
  GetModelCatalog = 'pi:get_model_catalog',
  /** renderer → main: kick a background catalog reload and get the current snapshot back immediately */
  RefreshModelCatalog = 'pi:refresh_model_catalog',
  /** main → renderer: the model catalog changed (push, no request) */
  ModelCatalogUpdated = 'pi:model_catalog_updated',
  /** renderer → main: ensure the terminal process for an id is running and deliver its data MessagePort */
  TerminalStart = 'pi:terminal_start',
  /** renderer → main: kill the terminal process for an id (tab close / LRU / TTL eviction) */
  TerminalStop = 'pi:terminal_stop',
  /** main → renderer: deliver a terminal's data MessagePort (payload carries its id) */
  TerminalPort = 'pi:terminal_port',
  /** main → renderer: a terminal process exited (payload carries its id) */
  TerminalExit = 'pi:terminal_exit',
  /** renderer → main: the current auto-update status (also for a late subscriber, e.g. a reopened window) */
  GetUpdateStatus = 'pi:get_update_status',
  /** renderer → main: check for updates now; a found update downloads and shows the progress window */
  CheckForUpdates = 'pi:check_for_updates',
  /** renderer → main: abort an in-flight update download */
  CancelUpdateDownload = 'pi:cancel_update_download',
  /**
   * renderer → main: close the progress window on Escape without touching the
   * download.
   */
  DismissUpdateWindow = 'pi:dismiss_update_window',
  /** renderer → main: quit and install the downloaded update */
  QuitAndInstallUpdate = 'pi:quit_and_install_update',
  /** main → renderer: the auto-update status changed */
  UpdateStatusChanged = 'pi:update_status_changed',
  /**
   * renderer → main: how tall the progress window's content needs to be, so the
   * window can hug it instead of reserving a fixed box.
   */
  UpdateProgressContentHeight = 'pi:update_progress_content_height',
  /** main → renderer: one `pigi` CLI request to execute (RemoteCommandRequest) */
  RemoteCommand = 'pi:remote_command',
  /** main → renderer: the CLI that sent a request disconnected */
  RemoteCommandCancel = 'pi:remote_command_cancel',
  /** renderer → main: a JSON-RPC line for the CLI (RemoteCommandOutput) */
  RemoteCommandOutput = 'pi:remote_command_output',
  /** renderer → main: remote commands can be executed from now on */
  RemoteControlReady = 'pi:remote_control_ready',
  /** renderer → main: where the `pigi` command stands on the PATH of outside terminals */
  GetCliInstallState = 'pi:get_cli_install_state',
  /** renderer → main: install or remove the `pigi` command; answers with the new state */
  SetCliInstalled = 'pi:set_cli_installed',
  /** main → renderer: the `pigi` command was installed, removed or found changed */
  CliInstallStateChanged = 'pi:cli_install_state_changed',
}

/**
 * A `pigi` CLI request relayed by main. Main has validated the envelope and the
 * params against `REMOTE_METHODS`; `id` is the client's JSON-RPC id, echoed in
 * the answer the renderer serializes.
 */
export interface RemoteCommandRequest {
  requestId: number;
  id: string | number;
  method: RemoteMethod;
  params: Record<string, string | number | boolean>;
}

/** One serialized JSON-RPC line; `final` ends the request. */
export interface RemoteCommandOutput {
  requestId: number;
  line: string;
  final: boolean;
}

// =============================================================================
// Terminal panel (bottom PTY) — high-volume I/O flows over a data MessagePort,
// mirroring the session architecture. Main only spawns the process and hands
// off the port. There is one process (and one MessagePort) per terminal tab,
// keyed by a unique id (the shell's working directory is a separate param, so
// multiple tabs can share a cwd). The renderer groups tabs by project and keeps
// an LRU of the most-recent projects.
// =============================================================================

/** renderer → terminal utility, over the terminal data MessagePort */
export type TerminalInboundMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number };

/** terminal utility → renderer, over the terminal data MessagePort */
export type TerminalOutboundMessage =
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number };

/** main → terminal utility, over parentPort (lifecycle only) */
export type TerminalUtilityCommand =
  | { type: 'start_terminal'; cwd: string; cols: number; rows: number }
  | { type: 'attach_terminal_port' };

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

export interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDefinition {
  id: string;
  label: string;
  defaultBinding: ShortcutBinding;
  binding: ShortcutBinding;
}

export interface ListProjectSessionsCommand {
  type: 'list_project_sessions';
  requestId: string;
  cwds: string[];
}

export interface RenameSessionCommand {
  type: 'rename_session';
  requestId: string;
  sessionPath: string;
  name: string;
}

export interface ReadSessionMessagesCommand {
  type: 'read_session_messages';
  requestId: string;
  sessionPath: string;
}

export interface ReloadCatalogCommand {
  type: 'reload_catalog';
}

export interface ReadSettingsCommand {
  type: 'read_settings';
  requestId: string;
  cwd: string;
}

export interface WriteSettingsCommand {
  type: 'write_settings';
  requestId: string;
  cwd: string;
  scope: PiSettingsScope;
  /** Fields applied in one locked read-modify-write. */
  updates: PiSettingUpdate[];
}

export type SessionWorkerCommand =
  | ListProjectSessionsCommand
  | RenameSessionCommand
  | ReadSessionMessagesCommand
  | ReloadCatalogCommand
  | ReadSettingsCommand
  | WriteSettingsCommand;

/**
 * A prompt-cache refresh the SDK ran in the background while a long tool run
 * kept the conversation idle. The transcript draws one marker per refresh.
 */
export interface CacheWarmEntry {
  id: string;
  /** Entry timestamp (ISO), used to place the marker among hydrated messages. */
  timestamp: string;
}

export type SessionWorkerResponse =
  | ({ type: 'project_sessions_chunk' } & ProjectSessionsChunk)
  | { type: 'rename_session_result'; requestId: string; success: boolean; error?: string }
  | {
      type: 'session_messages_result';
      requestId: string;
      success: boolean;
      messages?: unknown[];
      compactionCount?: number;
      thinkingLevel?: ThinkingLevel;
      model?: { provider: string; modelId: string } | null;
      cacheWarmEntries?: CacheWarmEntry[];
      error?: string;
    }
  | { type: 'catalog_updated'; models: ModelInfo[] }
  | ({ type: 'settings_result'; requestId: string } & PiSettingsResult);

// =============================================================================
// Internal: Main ↔ package worker (one process per request)
// =============================================================================

/** `cwd` is the active project, or null for user scope only. */
export type PackageWorkerCommand =
  | { type: 'list'; cwd: string | null }
  | { type: 'check'; cwd: string | null }
  | { type: 'operate'; cwd: string | null; operation: PiPackageOperation };

export type PackageWorkerResponse =
  | { type: 'list_result'; result: PiPackagesResult }
  | { type: 'check_result'; result: PiPackagesHealthResult }
  /** The worker leaves a failure's `log` empty; main fills in the npm/git output. */
  | { type: 'operate_result'; result: PiPackageOperationResult };

// =============================================================================
// Internal: Main → Utility (parentPort, lifecycle only)
// =============================================================================

/**
 * Set only at creation: `setModel`/`setThinkingLevel` would also write the
 * user's global defaults.
 */
export interface CreateSessionOptions {
  model?: { provider: string; modelId: string };
  thinkingLevel?: ThinkingLevel;
  /** Write the `pigi.subagent` entry before the first message. */
  subagent?: boolean;
}

export type UtilityCommand =
  | {
      type: 'create_session';
      cwd: string;
      parentSessionPath?: string;
      options?: CreateSessionOptions;
    }
  | { type: 'resume_session'; sessionPath: string }
  | { type: 'warm_up'; cwds: string[] }
  | { type: 'prewarm_session_services'; cwds: string[] }
  | { type: 'attach_ports' };

// =============================================================================
// Internal: Utility → Main (parentPort, lifecycle only)
// =============================================================================

export type UtilityResponse =
  | { type: 'session_created'; sessionId: string; sessionPath: string }
  | { type: 'session_error'; error: string }
  | { type: 'session_busy_changed'; isBusy: boolean }
  // Services prewarmed; the process is ready to be claimed as a session. The
  // model catalog is served by the session worker, so this carries no payload.
  | { type: 'warm_ready' }
  | { type: 'credentials_changed' };
