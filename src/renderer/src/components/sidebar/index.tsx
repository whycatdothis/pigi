import { memo, useEffect, useState, useCallback, useRef } from 'react';
import {
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
  SidebarGroupAction,
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
                ? 'border-dashed border-input hover:border-foreground/40'
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
          className="h-7"
        />
      </div>
      {error !== null && <div className="px-1 pt-0.5 text-caption text-destructive">{error}</div>}
    </div>
  );
}

const HEADER_BUTTON_CLASS =
  'flex size-5 items-center justify-center rounded-chip text-muted-foreground transition-opacity hover:text-foreground';

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
  useEffect(() => {
    localStorage.setItem(EXPANDED_PROJECTS_STORAGE_KEY, JSON.stringify([...expandedProjects]));
  }, [expandedProjects]);
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
                onClick={() => setCreatingTask(true)}
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

        <SidebarContent className="overflow-hidden">
          {(tasks.length > 0 || creatingTask) && (
            <SidebarGroup className="shrink-0">
              <div className="group/tasks-header flex items-center">
                <SidebarGroupLabel className="font-semibold text-sidebar-foreground/60">
                  Tasks
                </SidebarGroupLabel>
                <div className="ml-auto flex items-center gap-1.5 pr-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="What is a task"
                        className={`${HEADER_BUTTON_CLASS} opacity-0 group-hover/tasks-header:opacity-100`}
                      >
                        <IconHelp className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="end"
                      className="max-w-64 flex-col items-start gap-1.5 text-left"
                    >
                      <span>
                        A task is a workspace on its own, not tied to one project: its sessions are
                        grouped here in the sidebar.
                      </span>
                      <span>
                        As you chat, pigi adds directories you mention to the task&apos;s working
                        directories and suggests ones it notices; wrong ones can be edited or
                        dismissed by hand.
                      </span>
                      <span>
                        The task has its own git directory for plans, reviews and notes that belong
                        to no single repo.
                      </span>
                    </TooltipContent>
                  </Tooltip>
                  {(showHiddenTasks || tasks.some((task) => task.hidden)) && (
                    <button
                      type="button"
                      title={showHiddenTasks ? 'Hide hidden tasks' : 'Show hidden tasks'}
                      aria-label={showHiddenTasks ? 'Hide hidden tasks' : 'Show hidden tasks'}
                      onClick={() => setShowHiddenTasks((current) => !current)}
                      // Always visible while hidden tasks exist: a hover-only
                      // button is the only way back, and nobody can find it.
                      className={
                        showHiddenTasks
                          ? `${HEADER_BUTTON_CLASS} text-foreground`
                          : HEADER_BUTTON_CLASS
                      }
                    >
                      {showHiddenTasks ? (
                        <IconEye className="size-4" />
                      ) : (
                        <IconEyeOff className="size-4" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    title="New task"
                    aria-label="New task"
                    onClick={() => setCreatingTask(true)}
                    className={`${HEADER_BUTTON_CLASS} opacity-0 group-hover/tasks-header:opacity-100`}
                  >
                    <IconPlus className="size-4" />
                  </button>
                </div>
              </div>
              {creatingTask && (
                <NewTaskInput
                  existingNames={tasks.map((task) => task.name)}
                  onCreateTask={onCreateTask}
                  onUpdateTask={onUpdateTask}
                  onCancel={() => setCreatingTask(false)}
                />
              )}
              <SidebarGroupContent className="max-h-72 overflow-x-hidden overflow-y-auto no-scrollbar">
                <TaskList
                  tasks={tasks}
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
                />
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <SidebarGroup className="min-h-0 flex-1">
            <div className="group/projects-header">
              <SidebarGroupLabel className="font-semibold text-sidebar-foreground/60">
                Projects
              </SidebarGroupLabel>
              <SidebarGroupAction
                onClick={onOpenProject}
                title="Open project"
                className="opacity-0 group-hover/projects-header:opacity-100 transition-opacity"
              >
                <IconFolderPlus />
                <span className="sr-only">Open project</span>
              </SidebarGroupAction>
            </div>
            <SidebarGroupContent className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto no-scrollbar content-fade-bottom">
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
