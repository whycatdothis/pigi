import { memo, useEffect, useState, useCallback, useRef } from 'react';
import {
  IconFolderPlus,
  IconMessageCirclePlus,
  IconSettings,
  IconLogin2,
  IconRefresh,
  IconDownload,
} from '@tabler/icons-react';
import { SidebarToggle } from './sidebarToggle';
import type { PiSessionInfo } from '../../../../shared/ipcContract';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { Kbd, MENU_ROW_KBD_CLASS_NAME } from '../ui/kbd';
import { isSessionRunning } from './utils';
import { useAppStore } from '../../state/appStore';
import { listProjectSessions } from '../../services/piAgentClient';
import { TooltipProvider } from '../ui/tooltip';
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
import type { SidebarProps } from './types';
import { ProjectList } from './projectList';
import { getProjectSessions as getOrderedProjectSessions } from '../../lib/projectSessions';

const EXPANDED_PROJECTS_STORAGE_KEY = 'pigi.expandedProjects';

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
  projectSessions,
  shortcutBindings,
  onNewSession,
  onNewSessionForProject,
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
  useEffect(() => {
    localStorage.setItem(EXPANDED_PROJECTS_STORAGE_KEY, JSON.stringify([...expandedProjects]));
  }, [expandedProjects]);
  const visibleWhenCollapsedSessionIds = useAppStore(
    (state) => state.visibleWhenCollapsedSessionIds,
  );
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
        <SidebarHeader style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex h-10 items-start justify-end">
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
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden">
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
                  className="w-60 menu-content flex flex-col gap-1"
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
