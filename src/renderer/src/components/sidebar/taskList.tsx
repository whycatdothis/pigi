import { useCallback, useState } from 'react';
import {
  IconEye,
  IconEyeOff,
  IconListCheck,
  IconMessageCirclePlus,
  IconPencil,
} from '@tabler/icons-react';
import {
  TASK_NAME_PATTERN,
  type PiSessionInfo,
  type TaskInfo,
  type TaskResult,
  type TaskUpdate,
} from '../../../../shared/ipcContract';
import { useAppStore, type SessionEntry } from '../../state/appStore';
import { cn } from '../../lib/utils';
import { SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { SessionList } from './sessionList';
import { TaskEmojiPicker } from './taskEmojiPicker';
import { TaskWorkDirChips } from './taskWorkDirChips';

const NEW_TASK_SESSION_LABEL = 'New chat';

const RENAME_NAME_ERROR = 'Task names cannot contain / or start with a dot (max 64 characters).';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
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

  const handleStartRename = useCallback(() => {
    setEditValue(task.name);
    setRenameError(null);
    setIsEditing(true);
  }, [task.name]);

  const handleFinishRename = useCallback(async () => {
    const name = editValue.trim();
    if (name === '' || name === task.name) {
      setIsEditing(false);
      setRenameError(null);
      return;
    }
    if (!TASK_NAME_PATTERN.test(name)) {
      setRenameError(RENAME_NAME_ERROR);
      return;
    }
    const result = await onUpdateTask(task.path, { renameTo: name });
    if (result.success) {
      setIsEditing(false);
      setRenameError(null);
    } else {
      setRenameError(result.error);
    }
  }, [editValue, task.name, task.path, onUpdateTask]);

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || event.key === 'Process') return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleFinishRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsEditing(false);
      setRenameError(null);
    }
  };

  return (
    <SidebarMenuItem className={cn('group/task', isExpanded && 'mb-3')}>
      <ContextMenuRoot>
        <ContextMenuTrigger asChild>
          <SidebarMenuButton
            onClick={onToggleExpand}
            title={task.path}
            className={cn('text-sidebar-foreground/80', task.hidden && 'opacity-60')}
          >
            <TaskEmojiPicker
              open={emojiOpen}
              onOpenChange={setEmojiOpen}
              current={task.emoji}
              onSelect={(emoji) => void onUpdateTask(task.path, { setEmoji: emoji })}
            >
              {/* A span, not a button: the row itself is already a button and
                  buttons must not nest. The keydown opens the picker since a
                  span gets no native Enter/Space activation. */}
              <span
                role="button"
                tabIndex={0}
                title="Pick an emoji"
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-inline text-body leading-none hover:bg-foreground/10"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    setEmojiOpen(true);
                  }
                }}
              >
                {task.emoji ?? (
                  <IconListCheck className="size-4 text-muted-foreground" aria-hidden />
                )}
              </span>
            </TaskEmojiPicker>
            {isEditing ? (
              <input
                type="text"
                value={editValue}
                aria-invalid={renameError !== null}
                autoFocus
                onChange={(event) => {
                  setEditValue(event.target.value);
                  setRenameError(null);
                }}
                onBlur={() => void handleFinishRename()}
                onKeyDown={handleRenameKeyDown}
                onClick={(event) => event.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent text-body outline-none caret-foreground"
              />
            ) : (
              <span onDoubleClick={handleStartRename}>{task.name}</span>
            )}
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent className="menu-content">
          <ContextMenuItem onClick={handleStartRename}>
            <IconPencil />
            Rename task…
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => void onUpdateTask(task.path, { setHidden: !task.hidden })}
          >
            {task.hidden ? <IconEye /> : <IconEyeOff />}
            {task.hidden ? 'Unhide task' : 'Hide task'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenuRoot>
      {renameError !== null && (
        <div className="px-2 pt-0.5 text-caption text-destructive">{renameError}</div>
      )}
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
  /** Show hidden tasks (styled dimmed) instead of filtering them out. */
  showHidden: boolean;
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
  showHidden,
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
      {tasks
        .filter((task) => showHidden || !task.hidden)
        .map((task) => (
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
