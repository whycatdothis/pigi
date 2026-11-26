import { useCallback, useRef, useState } from 'react';
import {
  IconEye,
  IconEyeOff,
  IconListCheck,
  IconMessageCirclePlus,
  IconPencil,
} from '@tabler/icons-react';
import {
  TASK_NAME_ERROR,
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
  const inputRef = useRef<HTMLInputElement>(null);
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
      setRenameError(TASK_NAME_ERROR);
      inputRef.current?.focus();
      return;
    }
    const result = await onUpdateTask(task.path, { renameTo: name });
    if (result.success) {
      setIsEditing(false);
      setRenameError(null);
    } else {
      // A blur submit failed: keep editing and put the cursor back so the
      // error can be fixed without clicking the row again.
      setRenameError(result.error);
      inputRef.current?.focus();
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
          {isEditing ? (
            // A div in the row's clothes: an input inside the row's <button>
            // would be nested interactive content, which HTML forbids.
            <SidebarMenuButton
              asChild
              title={task.path}
              className={cn('text-sidebar-foreground/80', task.hidden && 'opacity-60')}
            >
              <div>
                <span className="size-6 shrink-0" aria-hidden />
                <input
                  ref={inputRef}
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
                  className="min-w-0 flex-1 bg-transparent text-body outline-none caret-foreground"
                />
              </div>
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              onClick={onToggleExpand}
              title={task.path}
              className={cn('text-sidebar-foreground/80', task.hidden && 'opacity-60')}
            >
              {/* Spacer under the absolutely-positioned emoji button below. */}
              <span className="size-6 shrink-0" aria-hidden />
              <span onDoubleClick={handleStartRename}>{task.name}</span>
            </SidebarMenuButton>
          )}
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
      {/* Sibling of the row button, not a child: interactive content inside
          a <button> is invalid HTML, so the trigger sits over the row's icon
          spot like SidebarMenuAction does on the right. */}
      <TaskEmojiPicker
        open={emojiOpen}
        onOpenChange={setEmojiOpen}
        current={task.emoji}
        onSelect={(emoji) => void onUpdateTask(task.path, { setEmoji: emoji })}
      >
        <button
          type="button"
          title="Pick an emoji"
          aria-label="Pick an emoji"
          className={cn(
            'absolute top-1 left-2 flex size-6 items-center justify-center rounded-inline text-body leading-none outline-hidden hover:bg-foreground/10 focus-visible:ring-2 ring-sidebar-ring',
            task.hidden && 'opacity-60',
          )}
        >
          {task.emoji ?? <IconListCheck className="size-4 text-muted-foreground" aria-hidden />}
        </button>
      </TaskEmojiPicker>
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
