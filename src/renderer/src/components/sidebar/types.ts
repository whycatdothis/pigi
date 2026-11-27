import type {
  PiSessionInfo,
  ProjectDirectory,
  TaskInfo,
  TaskResult,
  TaskUpdate,
} from '../../../../shared/ipcContract';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import type { SessionEntry } from '../../state/appStore';

export interface SidebarProps {
  sessions: Map<string, SessionEntry>;
  selectedSessionPath: string | null;
  recentProjects: ProjectDirectory[];
  tasks: TaskInfo[];
  projectSessions: Record<string, PiSessionInfo[]>;
  shortcutBindings: Map<string, ShortcutBinding> | null;
  onNewSession: () => void;
  onNewSessionForProject: (path: string) => void;
  onCreateTask: (name: string) => Promise<TaskResult>;
  onUpdateTask: (taskPath: string, update: TaskUpdate) => Promise<TaskResult>;
  onSelectTaskWorkDir: (taskPath: string, dir: string | null) => void;
  onResumeSession: (session: PiSessionInfo) => void;
  onOpenProject: () => void;
  onRemoveProject: (path: string) => void;
  onReorderProjects: (paths: string[]) => void;
  onRenameSession: (sessionPath: string, name: string) => void;
  onLogin: () => void;
  /** Version ready to install, or null when there is nothing to install. */
  pendingUpdateVersion: string | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onOpenSettings: () => void;
}
