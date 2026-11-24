import { IconListCheck, IconMessageCirclePlus } from '@tabler/icons-react';
import type {
  PiSessionInfo,
  TaskInfo,
  TaskResult,
  TaskUpdate,
} from '../../../../shared/ipcContract';
import { useAppStore, type SessionEntry } from '../../state/appStore';
import { cn } from '../../lib/utils';
import { SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar';
import { SessionList } from './sessionList';
import { TaskWorkDirChips } from './taskWorkDirChips';

const NEW_TASK_SESSION_LABEL = 'New chat';

interface TaskItemProps {
  task: TaskInfo;
  sessions: Map<string, SessionEntry>;
  projectSessions: PiSessionInfo[];
  visibleWhenCollapsedSessionIds: Set<string>;
  selectedSessionPath: string | null;
  relativeTimeBase: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onNewSession: () => void;
  onResumeSession: (session: PiSessionInfo) => void;
  onRenameSession: (sessionPath: string, name: string) => void;
  onUpdateTask: (taskPath: string, update: TaskUpdate) => Promise<TaskResult>;
  onSelectWorkDir: (taskPath: string, dir: string | null) => void;
}

function TaskItem({
  task,
  sessions,
  projectSessions,
  visibleWhenCollapsedSessionIds,
  selectedSessionPath,
  relativeTimeBase,
  isExpanded,
  onToggleExpand,
  onNewSession,
  onResumeSession,
  onRenameSession,
  onUpdateTask,
  onSelectWorkDir,
}: TaskItemProps): React.JSX.Element {
  const hasHiddenUnread = useAppStore(
    (state) =>
      !isExpanded &&
      projectSessions.some(
        (session) =>
          !session.isSubagent &&
          state.unreadSessionPaths.has(session.path) &&
          !visibleWhenCollapsedSessionIds.has(session.id),
      ),
  );

  return (
    <SidebarMenuItem className={cn('group/task', isExpanded && 'mb-3')}>
      <SidebarMenuButton
        onClick={onToggleExpand}
        title={task.path}
        className="text-sidebar-foreground/80"
      >
        <IconListCheck data-icon="inline-start" />
        <span>{task.name}</span>
      </SidebarMenuButton>
      {hasHiddenUnread && (
        <span
          role="status"
          aria-label="Unread"
          className="pointer-events-none absolute top-3 right-2 size-2 rounded-full bg-[var(--system-accent)] transition-opacity group-hover/task:opacity-0"
        />
      )}
      <SidebarMenuAction
        title={`${NEW_TASK_SESSION_LABEL} in ${task.name}`}
        onClick={onNewSession}
        className="opacity-0 transition-opacity group-hover/task:opacity-100"
      >
        <IconMessageCirclePlus />
        <span className="sr-only">{NEW_TASK_SESSION_LABEL}</span>
      </SidebarMenuAction>

      {isExpanded && (
        <TaskWorkDirChips
          task={task}
          onUpdateTask={onUpdateTask}
          onSelectWorkDir={onSelectWorkDir}
        />
      )}
      <SessionList
        sessions={sessions}
        projectSessions={projectSessions}
        selectedSessionPath={selectedSessionPath}
        relativeTimeBase={relativeTimeBase}
        isExpanded={isExpanded}
        visibleWhenCollapsedSessionIds={visibleWhenCollapsedSessionIds}
        onResumeSession={onResumeSession}
        onRenameSession={onRenameSession}
      />
    </SidebarMenuItem>
  );
}

interface TaskListProps {
  tasks: TaskInfo[];
  sessions: Map<string, SessionEntry>;
  selectedSessionPath: string | null;
  relativeTimeBase: number;
  expandedProjects: Set<string>;
  visibleWhenCollapsedSessionIdsByPath: Record<string, Set<string>>;
  onToggleExpand: (path: string) => void;
  onNewSessionForProject: (path: string) => void;
  onResumeSession: (session: PiSessionInfo) => void;
  onRenameSession: (sessionPath: string, name: string) => void;
  getProjectSessions: (projectPath: string) => PiSessionInfo[];
  onUpdateTask: (taskPath: string, update: TaskUpdate) => Promise<TaskResult>;
  onSelectWorkDir: (taskPath: string, dir: string | null) => void;
}

/** The sidebar's task section. Tasks reuse the project's expand/session plumbing keyed by path. */
export function TaskList({
  tasks,
  sessions,
  selectedSessionPath,
  relativeTimeBase,
  expandedProjects,
  visibleWhenCollapsedSessionIdsByPath,
  onToggleExpand,
  onNewSessionForProject,
  onResumeSession,
  onRenameSession,
  getProjectSessions,
  onUpdateTask,
  onSelectWorkDir,
}: TaskListProps): React.JSX.Element {
  return (
    <SidebarMenu>
      {tasks.map((task) => (
        <TaskItem
          key={task.path}
          task={task}
          sessions={sessions}
          projectSessions={getProjectSessions(task.path)}
          visibleWhenCollapsedSessionIds={
            visibleWhenCollapsedSessionIdsByPath[task.path] ?? new Set()
          }
          selectedSessionPath={selectedSessionPath}
          relativeTimeBase={relativeTimeBase}
          isExpanded={expandedProjects.has(task.path)}
          onToggleExpand={() => onToggleExpand(task.path)}
          onNewSession={() => onNewSessionForProject(task.path)}
          onResumeSession={onResumeSession}
          onRenameSession={onRenameSession}
          onUpdateTask={onUpdateTask}
          onSelectWorkDir={onSelectWorkDir}
        />
      ))}
    </SidebarMenu>
  );
}
