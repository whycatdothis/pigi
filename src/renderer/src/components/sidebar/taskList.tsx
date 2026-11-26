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
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
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
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver,
}: TaskItemProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
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

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Use only the header row as the drag image
      if (rowRef.current) {
        e.dataTransfer.setDragImage(rowRef.current, 0, 0);
      }
      onDragStart(e);
    },
    [onDragStart],
  );

  return (
    <SidebarMenuItem
      className={cn(
        'group/task',
        isExpanded && 'mb-3',
        isDragOver && 'border-t-2 border-[var(--system-accent)]',
      )}
    >
      {/* Not draggable while renaming: drag would win over text selection. */}
      <div
        ref={rowRef}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
      >
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
                  <span className="size-4 shrink-0" aria-hidden />
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
            ) : isExpanded ? (
              // Expanded: the working-directory chips live inside the row, so
              // they hug the task name instead of sitting a row of padding
              // away. A div in the row's clothes (like the rename input
              // above): interactive chips inside a <button> would be nested
              // interactive content, which HTML forbids.
              <SidebarMenuButton
                asChild
                title={task.path}
                className={cn(
                  'h-auto flex-col items-stretch gap-0 text-sidebar-foreground/80',
                  task.hidden && 'opacity-60',
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={onToggleExpand}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onToggleExpand();
                    }
                  }}
                >
                  {/* h-4 re-creates the single-line row's content height
                      (h-8 minus p-2); the spacer matches the project rows'
                      folder icon slot. */}
                  <div className="flex h-4 items-center gap-1.5">
                    <span className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{task.name}</span>
                  </div>
                  <TaskWorkDirChips
                    task={task}
                    onUpdateTask={onUpdateTask}
                    onSelectWorkDir={onSelectWorkDir}
                  />
                </div>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                onClick={onToggleExpand}
                title={task.path}
                className={cn('text-sidebar-foreground/80', task.hidden && 'opacity-60')}
              >
                {/* Spacer under the absolutely-positioned emoji button below;
                  size-4 matches the project rows' folder icon slot. */}
                <span className="size-4 shrink-0" aria-hidden />
                <span>{task.name}</span>
              </SidebarMenuButton>
            )}
          </ContextMenuTrigger>
          <ContextMenuContent className="menu-content">
            <ContextMenuItem onClick={handleStartRename}>
              <IconPencil />
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => void onUpdateTask(task.path, { setHidden: !task.hidden })}
            >
              {task.hidden ? <IconEye /> : <IconEyeOff />}
              {task.hidden ? 'Unhide' : 'Hide'}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuRoot>
      </div>
      {/* Sibling of the row button, not a child: interactive content inside
          a <button> is invalid HTML, so the trigger sits over the row's icon
          spot like SidebarMenuAction does on the right. left-1 centers its
          24px box on the 16px icon slot (x≈16), so the emoji's ink lands
          where a project row's folder icon sits. */}
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
            'absolute top-1 left-1 flex size-6 items-center justify-center rounded-inline text-body leading-none outline-hidden hover:bg-foreground/10 focus-visible:ring-2 ring-sidebar-ring',
            task.hidden && 'opacity-60',
          )}
        >
          {task.emoji ?? (
            // The row button's own color (text-sidebar-foreground/80), so the
            // default icon is as dark as a project row's folder icon.
            <IconListCheck className="size-4 text-sidebar-foreground/80" aria-hidden />
          )}
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
  /** Commits the full task order after a drop, hidden tasks included. */
  onReorderTasks: (paths: string[]) => void;
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
  onReorderTasks,
}: TaskListProps): React.JSX.Element {
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const draggedPathRef = useRef<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, path: string) => {
    draggedPathRef.current = path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', path);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, path: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedPathRef.current && draggedPathRef.current !== path) {
      setDragOverPath(path);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetPath: string) => {
      e.preventDefault();
      setDragOverPath(null);
      const sourcePath = draggedPathRef.current;
      if (!sourcePath || sourcePath === targetPath) return;

      // Index math on the full list, not the visible one: hidden tasks keep
      // their places while the dragged task lands at the visible target.
      const paths = tasks.map((task) => task.path);
      const sourceIdx = paths.indexOf(sourcePath);
      const targetIdx = paths.indexOf(targetPath);
      if (sourceIdx === -1 || targetIdx === -1) return;

      paths.splice(sourceIdx, 1);
      paths.splice(targetIdx, 0, sourcePath);
      onReorderTasks(paths);
    },
    [tasks, onReorderTasks],
  );

  const handleDragEnd = useCallback(() => {
    draggedPathRef.current = null;
    setDragOverPath(null);
  }, []);

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
            onDragStart={(e) => handleDragStart(e, task.path)}
            onDragOver={(e) => handleDragOver(e, task.path)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, task.path)}
            isDragOver={dragOverPath === task.path}
          />
        ))}
    </SidebarMenu>
  );
}
