import React, { useState, useCallback } from 'react';
import { IconCheck, IconDots, IconFilter2, IconTerminal2 } from '@tabler/icons-react';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import type { WorkspaceTab } from '../../lib/workspaceTabs';
import WorkspaceTabs from '../app/WorkspaceTabs';
import { useAppStore } from '../../state/appStore';
import { useSettingsStore } from '../../state/settingsStore';
import { isToolBlockViewMode, type ToolBlockViewMode } from '../../../../shared/pigiSettings';
import {
  SIDEBAR_TOGGLE_CLEARANCE_PX,
  SIDEBAR_TRANSITION_CLASS_NAME,
  sidebarToggleLeft,
} from '../../lib/layoutConstants';
import { cn } from '../../lib/utils';
import { useTypewriter } from '../../hooks/useTypewriter';
import { useRenameSuppress } from '../../hooks/useRenameSuppress';
import { getSessionTitle, isSessionRunning } from '../sidebar/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { SessionTreeHelpButton } from '../sessionTree/SessionTreeHelpDialog';
import { SessionTreeIcon } from '../sessionTree/sessionTreeIcons';
import { Kbd } from '../ui/kbd';
import { PanelIcon } from '../panelIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

function ToolBlockViewModeItems({
  value,
  onChange,
}: {
  value: ToolBlockViewMode;
  onChange: (value: ToolBlockViewMode) => void;
}): React.JSX.Element {
  return (
    <DropdownMenuRadioGroup
      value={value}
      onValueChange={(next) => {
        if (isToolBlockViewMode(next)) onChange(next);
      }}
    >
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuRadioItem value="minimal" compact showCheckIcon={false}>
              Minimal
              {value === 'minimal' && <IconCheck />}
            </DropdownMenuRadioItem>
          </TooltipTrigger>
          <TooltipContent side="left">
            Minimal activity view: working timer, tool cards, final summary
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuRadioItem value="compact_read" compact showCheckIcon={false}>
              Compact
              {value === 'compact_read' && <IconCheck />}
            </DropdownMenuRadioItem>
          </TooltipTrigger>
          <TooltipContent side="left">
            Collapse consecutive read-only tool calls into a single group
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuRadioItem value="default" compact showCheckIcon={false}>
              Show All
              {value === 'default' && <IconCheck />}
            </DropdownMenuRadioItem>
          </TooltipTrigger>
          <TooltipContent side="left">
            Display every tool call as an individual expanded block
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </DropdownMenuRadioGroup>
  );
}

interface SessionToolbarProps {
  sessionPath: string;
  onRenameSession: (sessionPath: string, name: string) => void;
  onOpenTree: () => void;
  /** Non-null while the tree cannot be used (compacting, summarizing). */
  treeDisabledReason?: string | null;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  /** Formatted shortcut (e.g. "⌘ J") shown in the terminal button tooltip. */
  terminalShortcutLabel: string;
  workspaceTab: WorkspaceTab;
  onSelectWorkspaceTab: (tab: WorkspaceTab) => void;
  shortcutBindings: Map<string, ShortcutBinding> | null;
}

export default React.memo(function SessionToolbar({
  sessionPath,
  onRenameSession,
  onOpenTree,
  treeDisabledReason,
  terminalOpen,
  onToggleTerminal,
  terminalShortcutLabel,
  workspaceTab,
  onSelectWorkspaceTab,
  shortcutBindings,
}: SessionToolbarProps): React.JSX.Element {
  const title = useAppStore(
    useCallback(
      (state) => {
        const cwd = state.sessions.get(sessionPath)?.cwd ?? '';
        const sessionList = cwd ? state.projectSessions[cwd] : undefined;
        if (sessionList) {
          const match = sessionList.find((s) => s.path === sessionPath);
          if (match) return getSessionTitle(match);
        }
        return state.sessions.get(sessionPath)?.title ?? 'New chat';
      },
      [sessionPath],
    ),
  );
  // With the sidebar hidden, the tabs start after the traffic lights and the sidebar toggle.
  const titleInset = useAppStore((state) =>
    state.sidebarExpanded
      ? undefined
      : sidebarToggleLeft(state.platform) + SIDEBAR_TOGGLE_CLEARANCE_PX,
  );
  const chatActivity = useAppStore((state) =>
    isSessionRunning(sessionPath, state.sessions)
      ? 'running'
      : state.unreadSessionPaths.has(sessionPath)
        ? 'unread'
        : null,
  );
  const hasPendingContext = useAppStore(
    (state) =>
      state.quotesBySession.has(sessionPath) || state.globalCommentBySession.has(sessionPath),
  );
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen);
  const toggleRightSidebar = useAppStore((state) => state.toggleRightSidebar);
  const toolBlockViewMode = useSettingsStore((state) => state.chat.toolBlockViewMode);
  const setToolBlockViewMode = useSettingsStore((state) => state.setToolBlockViewMode);

  const [displayTitle, skipNextAnimation] = useTypewriter(title);
  useRenameSuppress(sessionPath, skipNextAnimation);

  const handleRenameChat = useCallback(
    (name: string) => onRenameSession(sessionPath, name),
    [onRenameSession, sessionPath],
  );

  const [treeTooltipOpen, setTreeTooltipOpen] = useState(false);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 pr-3 h-11 border-b-[0.5px] border-foreground/27 transition-[padding] @container @max-[320px]:pr-2 @max-[220px]:pr-1 [-webkit-app-region:drag]',
        SIDEBAR_TRANSITION_CLASS_NAME,
      )}
      style={{ paddingLeft: titleInset }}
    >
      <WorkspaceTabs
        value={workspaceTab}
        onChange={onSelectWorkspaceTab}
        shortcutBindings={shortcutBindings}
        chatTitle={displayTitle}
        chatRenameTitle={title}
        chatActivity={chatActivity}
        onRenameChat={handleRenameChat}
        className="min-w-0 shrink"
      />

      <div className="flex-1" />

      {/* Below this width the tree/terminal/view actions no longer fit inline;
          they move into the overflow menu. The right-sidebar toggle also hides
          at the smallest widths, but stays available in that menu. */}
      <div className="flex items-center gap-2 @max-[430px]:hidden">
        <TooltipProvider delayDuration={400}>
          <Tooltip open={treeTooltipOpen} onOpenChange={setTreeTooltipOpen}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Session tree"
                onClick={onOpenTree}
                disabled={Boolean(treeDisabledReason)}
                className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors size-7 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [-webkit-app-region:no-drag]"
              >
                <SessionTreeIcon size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="gap-3">
              <span>{treeDisabledReason ?? 'Session tree'}</span>
              <SessionTreeHelpButton onBeforeOpen={() => setTreeTooltipOpen(false)} />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Toggle terminal"
                aria-pressed={terminalOpen}
                onClick={onToggleTerminal}
                className={`flex items-center justify-center rounded p-1 transition-colors size-7 hover:bg-muted [-webkit-app-region:no-drag] ${terminalOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <IconTerminal2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Toggle terminal
              {terminalShortcutLabel && <Kbd>{terminalShortcutLabel}</Kbd>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="View mode"
              className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors size-7 [-webkit-app-region:no-drag]"
            >
              <IconFilter2 size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="menu-content w-fit min-w-0 bg-popover/50 backdrop-blur-md"
          >
            <ToolBlockViewModeItems value={toolBlockViewMode} onChange={setToolBlockViewMode} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions"
            title="More actions"
            className="hidden items-center justify-center rounded p-1 text-muted-foreground transition-colors size-7 hover:bg-muted hover:text-foreground @max-[430px]:flex @max-[220px]:size-5 [-webkit-app-region:no-drag]"
          >
            <IconDots size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="menu-content w-52 bg-popover/50 backdrop-blur-md"
        >
          <DropdownMenuItem
            disabled={Boolean(treeDisabledReason)}
            title={treeDisabledReason ?? undefined}
            onSelect={onOpenTree}
          >
            <SessionTreeIcon size={16} />
            Session tree
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleTerminal}>
            <IconTerminal2 size={16} />
            {terminalOpen ? 'Hide terminal' : 'Show terminal'}
            {terminalShortcutLabel && (
              <DropdownMenuShortcut>{terminalShortcutLabel}</DropdownMenuShortcut>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconFilter2 size={16} />
              View mode
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="menu-content w-44 bg-popover/50 backdrop-blur-md">
              <ToolBlockViewModeItems value={toolBlockViewMode} onChange={setToolBlockViewMode} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleRightSidebar}>
            <PanelIcon side="right" />
            Toggle right sidebar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Toggle right sidebar"
              aria-pressed={rightSidebarOpen}
              onClick={toggleRightSidebar}
              className={`relative flex items-center justify-center rounded p-1 transition-colors size-7 hover:bg-muted @max-[220px]:hidden [-webkit-app-region:no-drag] ${rightSidebarOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <PanelIcon side="right" />
              {/* Pending quotes and comments are otherwise invisible while the sidebar is closed. */}
              {hasPendingContext && !rightSidebarOpen && (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-[var(--system-accent)]" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle right sidebar</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});
