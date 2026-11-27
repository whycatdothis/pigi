import { memo, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconFolderPlus,
  IconHelp,
  IconListCheck,
  IconMessageCirclePlus,
  IconPlus,
  IconSettings,
  IconLogin2,
  IconRefresh,
  IconDownload,
  IconCube,
} from '@tabler/icons-react';
import { SidebarToggle } from './sidebarToggle';
import {
  TASK_NAME_ERROR,
  TASK_NAME_PATTERN,
  type PiSessionInfo,
  type TaskResult,
  type TaskUpdate,
} from '../../../../shared/ipcContract';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { Kbd, MENU_ROW_KBD_CLASS_NAME } from '../ui/kbd';
import { isSessionRunning } from './utils';
import { useAppStore } from '../../state/appStore';
import { listProjectSessions } from '../../services/piAgentClient';
import { Input } from '../ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../ui/sidebar';
import { MenuItem } from '../app/MenuItem';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';
import type { SidebarProps } from './types';
import { ProjectList } from './projectList';
import { TaskEmojiPicker } from './taskEmojiPicker';
import { TaskList } from './taskList';
import { getProjectSessions as getOrderedProjectSessions } from '../../lib/projectSessions';
import { loadTaskOrder, saveTaskOrder, sortTasksByOrder } from '../../lib/taskOrder';

const EXPANDED_PROJECTS_STORAGE_KEY = 'pigi.expandedProjects';

/**
 * The inline create row under the Tasks header; replaces a dialog so naming a
 * task happens where the task will appear. Enter creates, Escape or clicking
 * away cancels, and the value survives a failed create for fixing.
 */
function NewTaskInput({
  existingNames,
  onCreateTask,
  onUpdateTask,
  onCancel,
}: {
  existingNames: string[];
  onCreateTask: (name: string) => Promise<TaskResult>;
  onUpdateTask: (taskPath: string, update: TaskUpdate) => Promise<TaskResult>;
  onCancel: () => void;
}): React.JSX.Element {
  const [value, setValue] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State lags a rapid second Enter; the ref is what actually dedupes submits.
  const busyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (): Promise<void> => {
    const name = value.trim();
    if (name === '' || busyRef.current) return;
    if (!TASK_NAME_PATTERN.test(name)) {
      setError(TASK_NAME_ERROR);
      return;
    }
    if (existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setError(`A task named "${name}" already exists.`);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const result = await onCreateTask(name);
    if (result.success && emoji !== null) {
      // Cosmetic: the task already exists, so a failed emoji save only drops the icon.
      const emojiResult = await onUpdateTask(result.task.path, { setEmoji: emoji });
      if (!emojiResult.success) console.error('Failed to set the task emoji:', emojiResult.error);
    }
    busyRef.current = false;
    setBusy(false);
    if (result.success) {
      onCancel();
    } else {
      setError(result.error);
      // Disabled blurred the input; give the focus back for fixing the name.
      inputRef.current?.focus();
    }
  };

  return (
    <div className="pb-1">
      <div
        ref={containerRef}
        className="flex items-center gap-1.5"
        onBlur={() => {
          // Deferred: clicking the emoji slot or a picker button blurs the
          // input first; by the next tick focus has landed, and only a target
          // outside both this row and the (portaled) picker really cancels.
          window.setTimeout(() => {
            if (busyRef.current) return;
            const active = document.activeElement;
            if (active instanceof HTMLElement) {
              if (containerRef.current?.contains(active)) return;
              if (active.closest('[data-slot="popover-content"]') !== null) return;
            }
            onCancel();
          });
        }}
      >
        <TaskEmojiPicker
          open={emojiPickerOpen}
          onOpenChange={setEmojiPickerOpen}
          current={emoji}
          onSelect={setEmoji}
        >
          <button
            type="button"
            title="Pick an emoji"
            aria-label="Pick an emoji"
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-control border text-lg leading-none',
              emoji === null
                ? 'border-dashed border-foreground/40'
                : 'border-transparent hover:bg-foreground/10',
            )}
          >
            {emoji}
          </button>
        </TaskEmojiPicker>
        <Input
          ref={inputRef}
          type="text"
          value={value}
          placeholder="Task name"
          aria-label="Task name"
          aria-invalid={error !== null}
          disabled={busy}
          autoFocus
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.key === 'Process') return;
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
          // No focus ring: the row is already the active thing on screen,
          // a second outline only shouts.
          className="h-7 focus-visible:border-input focus-visible:ring-0"
        />
      </div>
      {error !== null && <div className="px-1 pt-0.5 text-caption text-destructive">{error}</div>}
    </div>
  );
}

// The 20px square buttons on the Tasks/Projects group headers.
const HEADER_BUTTON_CLASS =
  'flex size-5 items-center justify-center rounded-chip text-sidebar-foreground transition-opacity';

/**
 * Folds a whole sidebar group, on the label's left like a session row's
 * CollapseToggle. Always visible: a collapsed group's only way back open.
 */
function GroupCollapseToggle({
  collapsed,
  label,
  onToggle,
}: {
  collapsed: boolean;
  label: string;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
      aria-expanded={!collapsed}
      // The header row toggles too; keep the click from doing it twice.
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="ml-1 flex size-5 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {collapsed ? (
        <IconChevronRight className="size-3.5" />
      ) : (
        <IconChevronDown className="size-3.5" />
      )}
    </button>
  );
}

const COLLAPSED_GROUPS_STORAGE_KEY = 'pigi.collapsedGroups';

function loadExpandedProjects(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EXPANDED_PROJECTS_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? new Set(parsed.filter((path): path is string => typeof path === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function loadCollapsedGroups(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export default memo(function Sidebar({
  sessions,
  selectedSessionPath,
  recentProjects,
  tasks,
  projectSessions,
  shortcutBindings,
  onNewSession,
  onNewSessionForProject,
  onCreateTask,
  onUpdateTask,
  onSelectTaskWorkDir,
  onResumeSession,
  onOpenProject,
  onRemoveProject,
  onReorderProjects,
  onRenameSession,
  onLogin,
  pendingUpdateVersion,
  onCheckForUpdates,
  onInstallUpdate,
  onOpenSettings,
}: SidebarProps): React.JSX.Element {
  const [expandedProjects, setExpandedProjects] = useState(loadExpandedProjects);
  const [creatingTask, setCreatingTask] = useState(false);
  const [showHiddenTasks, setShowHiddenTasks] = useState(false);
  // Dragged task order; cosmetic display state, same tier as expandedProjects.
  const [taskOrder, setTaskOrder] = useState(loadTaskOrder);
  const handleReorderTasks = useCallback((paths: string[]) => {
    setTaskOrder(paths);
    saveTaskOrder(paths);
  }, []);
  const orderedTasks = useMemo(() => sortTasksByOrder(tasks, taskOrder), [tasks, taskOrder]);
  // Which group headers (tasks/projects) are collapsed; persisted like expandedProjects.
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsedGroups);
  const toggleGroupCollapsed = useCallback((group: 'tasks' | 'projects') => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);
  const tasksCollapsed = collapsedGroups.has('tasks');
  const projectsCollapsed = collapsedGroups.has('projects');
  const tasksGroupVisible = tasks.length > 0 || creatingTask;
  useEffect(() => {
    localStorage.setItem(EXPANDED_PROJECTS_STORAGE_KEY, JSON.stringify([...expandedProjects]));
  }, [expandedProjects]);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);
  const visibleWhenCollapsedSessionIds = useAppStore(
    (state) => state.visibleWhenCollapsedSessionIds,
  );
  const packagesOpen = useAppStore((state) => state.packagesOpen);
  const openPackages = useAppStore((state) => state.openPackages);
  const [relativeTimeBase, setRelativeTimeBase] = useState(() => Date.now());
  // Lets the effect retry when projectSessions loads after selectedSessionPath changes.
  const lastScrolledPathRef = useRef<string | null>(null);
  // The selection observed at the previous effect run — distinguishes a real
  // selection change from a projectSessions-only re-run.
  const lastSelectionRef = useRef<string | null>(null);
  // Selections that came from clicking an item in the session list: the item
  // is already under the cursor, so the scroll effect below must not move it
  // (centering on every click produced visible layout shift).
  const listClickedPathRef = useRef<string | null>(null);

  const handleResumeSessionFromList = useCallback(
    (session: PiSessionInfo) => {
      listClickedPathRef.current = session.path;
      onResumeSession(session);
    },
    [onResumeSession],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRelativeTimeBase(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-expand project and scroll to session when selection changes or when projectSessions loads
  useEffect(() => {
    if (!selectedSessionPath) {
      lastScrolledPathRef.current = null;
      lastSelectionRef.current = null;
      listClickedPathRef.current = null;
      return;
    }

    const selectionChanged = lastSelectionRef.current !== selectedSessionPath;
    lastSelectionRef.current = selectedSessionPath;

    // Clicked in the list — already visible under the cursor; never scroll.
    // Mark it as handled so projectSessions churn won't retry either. The
    // marker only suppresses this one selection: once the selection moves
    // elsewhere it is cleared below, so jumping back here via the switcher
    // or navigation history still centers the item.
    if (listClickedPathRef.current === selectedSessionPath) {
      lastScrolledPathRef.current = selectedSessionPath;
      return;
    }
    listClickedPathRef.current = null;

    // Selection unchanged since last run (projectSessions loaded/refreshed):
    // scroll at most once per selection.
    if (!selectionChanged && lastScrolledPathRef.current === selectedSessionPath) return;

    let targetProjectPath: string | null = null;
    for (const cwd of Object.keys(projectSessions)) {
      const sessions = projectSessions[cwd];
      if (sessions?.some((s) => s.path === selectedSessionPath)) {
        targetProjectPath = cwd;
        break;
      }
    }
    if (!targetProjectPath) return;

    lastScrolledPathRef.current = selectedSessionPath;

    const scrollToPath = selectedSessionPath;
    const projectPath = targetProjectPath;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      setExpandedProjects((prev) => {
        if (prev.has(projectPath)) return prev;
        const next = new Set(prev);
        next.add(projectPath);
        return next;
      });
      // Wait 2 frames: one for React to commit expandedProjects + any showAll state changes,
      // another for the browser to paint the updated DOM before querying for the element.
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          const el = document.querySelector(`[data-session-path="${CSS.escape(scrollToPath)}"]`);
          el?.scrollIntoView({ block: 'center' });
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionPath, projectSessions]);

  const getProjectSessions = useCallback(
    (projectPath: string): PiSessionInfo[] =>
      getOrderedProjectSessions(projectPath, projectSessions, sessions),
    [projectSessions, sessions],
  );

  const toggleProjectExpand = useCallback(
    (projectPath: string) => {
      const collapsing = expandedProjects.has(projectPath);
      setExpandedProjects((current) => {
        const next = new Set(current);
        if (collapsing) {
          next.delete(projectPath);
        } else {
          next.add(projectPath);
        }
        return next;
      });
      // Collapsing snapshots the running sessions so they stay listed.
      const runningIds = collapsing
        ? new Set(
            getProjectSessions(projectPath)
              .filter((session) => isSessionRunning(session.path, sessions))
              .map((session) => session.id),
          )
        : new Set<string>();
      useAppStore.getState().setVisibleWhenCollapsedSessionIds(projectPath, runningIds);
      if (!collapsing) void listProjectSessions([projectPath]);
    },
    [expandedProjects, getProjectSessions, sessions],
  );

  const handleNewSessionForProject = useCallback(
    (projectPath: string) => {
      setExpandedProjects((current) => {
        if (current.has(projectPath)) return current;
        const next = new Set(current);
        next.add(projectPath);
        return next;
      });
      onNewSessionForProject(projectPath);
    },
    [onNewSessionForProject],
  );

  return (
    <TooltipProvider delayDuration={300}>
      {/* Fill the App wrapper, which owns the width: its own --sidebar-width would
          lag a wrapper still easing wider and expose the transparent window. */}
      <ShadcnSidebar collapsible="none" data-testid="sidebar" className="w-full">
        {/* WebkitAppRegion is Electron-specific, not in React's CSSProperties */}
        <SidebarHeader className="pt-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex h-7 items-center justify-end">
            <SidebarToggle shortcutBinding={shortcutBindings?.get('sidebar.toggle')} />
          </div>
          <SidebarMenu style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onNewSession}>
                <IconMessageCirclePlus data-icon="inline-start" />
                <span>New chat</span>
                <Kbd className={MENU_ROW_KBD_CLASS_NAME}>
                  {formatShortcutLabel(
                    shortcutBindings?.get('sidebar.newChat') ??
                      ({ key: 'n', meta: true } satisfies ShortcutBinding),
                  )}
                </Kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  // Same as the group header's +: the input renders inside
                  // the group, so a collapsed group has to open first.
                  if (tasksCollapsed) toggleGroupCollapsed('tasks');
                  setCreatingTask(true);
                }}
                data-testid="sidebar-new-task"
              >
                <IconListCheck data-icon="inline-start" />
                <span>New task</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onOpenProject}>
                <IconFolderPlus data-icon="inline-start" />
                <span>Open project</span>
                <Kbd className={MENU_ROW_KBD_CLASS_NAME}>
                  {formatShortcutLabel(
                    shortcutBindings?.get('sidebar.openProject') ??
                      ({ key: 'o', meta: true } satisfies ShortcutBinding),
                  )}
                </Kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={packagesOpen}
                onClick={openPackages}
                data-testid="sidebar-packages"
              >
                <IconCube data-icon="inline-start" />
                <span>Packages</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* One plain list: both groups take their natural height and the
            column scrolls, instead of each group claiming half the space. */}
        <SidebarContent className="overflow-x-hidden overflow-y-auto no-scrollbar">
          {tasksGroupVisible && (
            // No bottom padding: the Projects group's top padding alone is
            // enough of a gap between the two sections.
            <SidebarGroup className="shrink-0 pb-0">
              {/* The whole bar toggles; the buttons on it stopPropagation. */}
              <div
                className="group/tasks-header flex cursor-pointer items-center"
                onClick={() => toggleGroupCollapsed('tasks')}
              >
                <GroupCollapseToggle
                  collapsed={tasksCollapsed}
                  label="tasks"
                  onToggle={() => toggleGroupCollapsed('tasks')}
                />
                <SidebarGroupLabel className="pl-0 font-semibold text-sidebar-foreground/60">
                  Tasks
                </SidebarGroupLabel>
                {/* The help button belongs to the label, not the action cluster. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What is a task"
                      onClick={(event) => event.stopPropagation()}
                      className={`${HEADER_BUTTON_CLASS} -ml-1 opacity-0 group-hover/tasks-header:opacity-100`}
                    >
                      <IconHelp className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    className="max-w-64 flex-col items-start gap-1.5 text-left"
                  >
                    <span>A task groups chats around a job, not a project.</span>
                    <span>Mention a directory and it becomes a working directory of the task.</span>
                    <span>Its own folder is a git repo, handy for notes and plans.</span>
                  </TooltipContent>
                </Tooltip>
                <div className="ml-auto flex items-center gap-1.5 pr-3">
                  {(showHiddenTasks || tasks.some((task) => task.hidden)) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={showHiddenTasks ? 'Hide hidden tasks' : 'Show hidden tasks'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowHiddenTasks((current) => !current);
                          }}
                          className={`${HEADER_BUTTON_CLASS} opacity-0 group-hover/tasks-header:opacity-100`}
                        >
                          {showHiddenTasks ? (
                            <IconEye className="size-4" />
                          ) : (
                            <IconEyeOff className="size-4" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="end">
                        {showHiddenTasks ? 'Hide hidden tasks' : 'Show hidden tasks'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <button
                    type="button"
                    title="New task"
                    aria-label="New task"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (tasksCollapsed) toggleGroupCollapsed('tasks');
                      setCreatingTask(true);
                    }}
                    className={`${HEADER_BUTTON_CLASS} opacity-0 group-hover/tasks-header:opacity-100`}
                  >
                    <IconPlus className="size-4" />
                  </button>
                </div>
              </div>
              {creatingTask && !tasksCollapsed && (
                <NewTaskInput
                  existingNames={tasks.map((task) => task.name)}
                  onCreateTask={onCreateTask}
                  onUpdateTask={onUpdateTask}
                  onCancel={() => setCreatingTask(false)}
                />
              )}
              {/* Same sticky constraint as the Projects group below: no
                  overflow here, or "Show less" never sticks. */}
              {!tasksCollapsed && (
                <SidebarGroupContent>
                  <TaskList
                    tasks={orderedTasks}
                    showHidden={showHiddenTasks}
                    sessions={sessions}
                    selectedSessionPath={selectedSessionPath}
                    relativeTimeBase={relativeTimeBase}
                    expandedProjects={expandedProjects}
                    visibleWhenCollapsedSessionIdsByPath={visibleWhenCollapsedSessionIds}
                    onToggleExpand={toggleProjectExpand}
                    onNewSessionForProject={handleNewSessionForProject}
                    onResumeSession={handleResumeSessionFromList}
                    onRenameSession={onRenameSession}
                    getProjectSessions={getProjectSessions}
                    onUpdateTask={onUpdateTask}
                    onSelectWorkDir={onSelectTaskWorkDir}
                    onReorderTasks={handleReorderTasks}
                  />
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          )}
          <SidebarGroup className={cn('shrink-0', tasksGroupVisible && tasksCollapsed && 'pt-0')}>
            {/* The whole bar toggles; the buttons on it stopPropagation. */}
            <div
              className="group/projects-header flex cursor-pointer items-center"
              onClick={() => toggleGroupCollapsed('projects')}
            >
              <GroupCollapseToggle
                collapsed={projectsCollapsed}
                label="projects"
                onToggle={() => toggleGroupCollapsed('projects')}
              />
              <SidebarGroupLabel className="pl-0 font-semibold text-sidebar-foreground/60">
                Projects
              </SidebarGroupLabel>
              <div className="ml-auto flex items-center gap-1.5 pr-3">
                <button
                  type="button"
                  title="Open project"
                  aria-label="Open project"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenProject();
                  }}
                  className={`${HEADER_BUTTON_CLASS} opacity-0 group-hover/projects-header:opacity-100`}
                >
                  <IconFolderPlus className="size-4" />
                </button>
              </div>
            </div>
            {/* No overflow on the group content: any value makes it the
                sticky container and "Show less" never sticks; SidebarContent
                already clips x. */}
            {!projectsCollapsed && (
              <SidebarGroupContent>
                <ProjectList
                  sessions={sessions}
                  recentProjects={recentProjects}
                  selectedSessionPath={selectedSessionPath}
                  relativeTimeBase={relativeTimeBase}
                  expandedProjects={expandedProjects}
                  visibleWhenCollapsedSessionIdsByPath={visibleWhenCollapsedSessionIds}
                  onToggleProjectExpand={toggleProjectExpand}
                  onNewSessionForProject={handleNewSessionForProject}
                  onResumeSession={handleResumeSessionFromList}
                  onOpenProject={onOpenProject}
                  onRemoveProject={onRemoveProject}
                  onReorderProjects={onReorderProjects}
                  onRenameSession={onRenameSession}
                  getProjectSessions={getProjectSessions}
                />
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="pt-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <Popover>
                <PopoverTrigger asChild>
                  <SidebarMenuButton>
                    <IconSettings data-icon="inline-start" />
                    <span className="truncate">Settings</span>
                    {/* An update that downloaded itself while the user was
                        elsewhere. The dot is the whole announcement. */}
                    {pendingUpdateVersion !== null && (
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-[var(--system-accent)]" />
                    )}
                  </SidebarMenuButton>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={2}
                  className="follows-text-size w-60 menu-content flex flex-col gap-1"
                >
                  {/* The hint is hover-only, so the row carries its own group. */}
                  <MenuItem onClick={onOpenSettings} className="group/menu-item">
                    <IconSettings />
                    <span>Settings</span>
                    <Kbd className={MENU_ROW_KBD_CLASS_NAME}>
                      {formatShortcutLabel(
                        shortcutBindings?.get('settings.open') ??
                          ({ key: ',', meta: true } satisfies ShortcutBinding),
                      )}
                    </Kbd>
                  </MenuItem>
                  {pendingUpdateVersion === null ? (
                    <MenuItem onClick={onCheckForUpdates}>
                      <IconRefresh />
                      <span>Check for Updates</span>
                    </MenuItem>
                  ) : (
                    <MenuItem onClick={onInstallUpdate}>
                      <IconDownload />
                      <span>Update to {pendingUpdateVersion}</span>
                      {/* Same dot as the row above, so the row itself carries
                          the announcement once the menu is open. */}
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-[var(--system-accent)]" />
                    </MenuItem>
                  )}
                  <MenuItem onClick={onLogin}>
                    <IconLogin2 />
                    <span>Login</span>
                  </MenuItem>
                </PopoverContent>
              </Popover>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </ShadcnSidebar>
    </TooltipProvider>
  );
});
