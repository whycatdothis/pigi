import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { IconLoader2, IconPencil } from '@tabler/icons-react';
import { useTypewriter } from '../../hooks/useTypewriter';
import type { PiSessionInfo } from '../../../../shared/ipcContract';
import type { SessionEntry } from '../../state/appStore';
import { buildLineage, flattenLineage, type LineageRow } from '../../lib/sessionLineage';
import { useRenameSuppress } from '../../hooks/useRenameSuppress';
import { SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '../ui/sidebar';
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { formatRelativeTime } from '../../lib/utils';
import { formatDateTime, getSessionTitle, isSessionRunning } from './utils';

interface SessionItemProps {
  row: LineageRow;
  isActive: boolean;
  isRunning: boolean;
  relativeTimeBase: number;
  onSwitch: () => void;
  onRename: (name: string) => void;
}

/**
 * Fork connector: one 12px column per ancestor level, plus the elbow into this
 * row. The list's items are 4px apart, so a line that runs on covers that gap
 * too (`-bottom-1`) — otherwise every fork reads as a dashed line.
 */
const LINEAGE_INDENT_PX = 12;
const LINEAGE_MAX_DEPTH = 3;

function LineagePrefix({ row }: { row: LineageRow }): React.JSX.Element | null {
  if (row.depth === 0) return null;
  // Deeper forks than the indent step allows keep the innermost columns:
  // a staircase off the sidebar's edge says less than the last few levels do.
  const columnCount = Math.min(row.depth, LINEAGE_MAX_DEPTH);
  const firstColumn = row.depth - columnCount;

  return (
    <span
      aria-hidden="true"
      data-lineage-depth={row.depth}
      className="flex shrink-0 self-stretch"
      style={{ width: columnCount * LINEAGE_INDENT_PX }}
    >
      {Array.from({ length: columnCount }, (_, offset) => {
        const column = firstColumn + offset;
        const isOwnColumn = column === row.depth - 1;
        const continues = isOwnColumn ? !row.isLast : (row.ancestorContinues[column] ?? false);
        return (
          <span key={column} className="relative w-3 shrink-0">
            {continues ? (
              <span className="absolute left-0 top-0 -bottom-1 w-px bg-foreground/15" />
            ) : (
              isOwnColumn && <span className="absolute left-0 top-0 h-1/2 w-px bg-foreground/15" />
            )}
            {isOwnColumn && (
              <span className="absolute left-0 top-1/2 h-px w-full bg-foreground/15" />
            )}
          </span>
        );
      })}
    </span>
  );
}

export function SessionItem({
  row,
  isActive,
  isRunning,
  relativeTimeBase,
  onSwitch,
  onRename,
}: SessionItemProps): React.JSX.Element {
  const session = row.session;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [displayTitle, skipNextAnimation] = useTypewriter(getSessionTitle(session));
  useRenameSuppress(session.path, skipNextAnimation);

  const handleStartRename = useCallback(() => {
    setEditValue(getSessionTitle(session));
    setIsEditing(true);
  }, [session]);

  const handleFinishRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== getSessionTitle(session)) {
      skipNextAnimation();
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editValue, session, onRename, skipNextAnimation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing || e.key === 'Process') {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFinishRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsEditing(false);
      }
    },
    [handleFinishRename],
  );

  const modifiedTime = session.modified || session.created;

  if (isEditing) {
    return (
      <SidebarMenuSubItem data-session-path={session.path}>
        <SidebarMenuSubButton
          asChild
          isActive={isActive}
          className="w-full justify-start pl-6 text-left text-sidebar-foreground/85 data-active:bg-primary/10 data-active:text-foreground"
        >
          <div>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={handleKeyDown}
              autoFocus
              className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none caret-foreground"
            />
          </div>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  return (
    <ContextMenuRoot>
      <ContextMenuTrigger asChild>
        <SidebarMenuSubItem data-session-path={session.path}>
          <SidebarMenuSubButton
            asChild
            isActive={isActive}
            className="w-full justify-start pl-6 text-left text-sidebar-foreground/85 data-active:bg-primary/10 data-active:text-foreground"
          >
            <button type="button" onClick={onSwitch} onDoubleClick={handleStartRename}>
              <LineagePrefix row={row} />
              <span className="min-w-0 flex-1 truncate text-left" title={getSessionTitle(session)}>
                {displayTitle}
              </span>
              {isRunning ? (
                <IconLoader2 className="ml-2 size-3.5 shrink-0 animate-[spin_1.8s_linear_infinite] text-green-500 will-change-transform" />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(modifiedTime, relativeTimeBase)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs flex flex-col gap-0.5 items-start">
                    <div>Created: {formatDateTime(session.created)}</div>
                    {session.modified && <div>Updated: {formatDateTime(session.modified)}</div>}
                  </TooltipContent>
                </Tooltip>
              )}
            </button>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </ContextMenuTrigger>
      <ContextMenuContent className="menu-content">
        <ContextMenuItem onClick={handleStartRename}>
          <IconPencil />
          Rename
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}

interface SessionListProps {
  sessions: Map<string, SessionEntry>;
  projectSessions: PiSessionInfo[];
  selectedSessionPath: string | null;
  relativeTimeBase: number;
  isExpanded: boolean;
  visibleWhenCollapsedSessionIds?: Set<string>;
  onResumeSession: (session: PiSessionInfo) => void;
  onRenameSession: (sessionPath: string, name: string) => void;
}

export function SessionList({
  sessions,
  projectSessions,
  selectedSessionPath,
  relativeTimeBase,
  isExpanded,
  visibleWhenCollapsedSessionIds,
  onResumeSession,
  onRenameSession,
}: SessionListProps): React.JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const visibleSessionCount = 5;

  const isCollapsedWithPinned =
    !isExpanded && visibleWhenCollapsedSessionIds && visibleWhenCollapsedSessionIds.size > 0;

  // Auto-expand "show more" when the selection lands on a hidden session
  // from outside this list (hydration, navigation history). Selections made
  // by clicking an item here are suppressed: the item was visible when
  // clicked, and an explicit "Show less" must never be overridden — not even
  // when a session-list refresh re-runs this effect after the collapse.
  // showAll is deliberately not a dependency (read via ref) so toggling it
  // never re-triggers the effect.
  const showAllRef = useRef(showAll);
  useEffect(() => {
    showAllRef.current = showAll;
  }, [showAll]);

  // When collapsed with pinned sessions, show only those (a fork whose parent
  // is not pinned then renders as a root, which is what the list can show).
  const renderedSessions = useMemo(
    () =>
      isCollapsedWithPinned
        ? projectSessions.filter((s) => visibleWhenCollapsedSessionIds!.has(s.id))
        : projectSessions,
    [projectSessions, isCollapsedWithPinned, visibleWhenCollapsedSessionIds],
  );
  const rows = useMemo(() => flattenLineage(buildLineage(renderedSessions)), [renderedSessions]);

  const suppressAutoExpandPathRef = useRef<string | null>(null);
  useEffect(() => {
    // The suppression marker is set synchronously in the click handler before
    // the selection render, so a fresh marker survives this effect run. Once
    // the selection moves elsewhere (external selection via switcher,
    // navigation history, or New chat → null), expire it: auto-expand must
    // apply again for hidden selections, exactly like the sidebar's scroll
    // marker.
    if (!selectedSessionPath) {
      suppressAutoExpandPathRef.current = null;
      return;
    }
    if (suppressAutoExpandPathRef.current !== selectedSessionPath) {
      suppressAutoExpandPathRef.current = null;
    }
    if (suppressAutoExpandPathRef.current === selectedSessionPath) {
      // Fresh click marker — suppress this selection only.
      return;
    }
    if (showAllRef.current) {
      return;
    }
    const hidden = rows.slice(visibleSessionCount);
    if (hidden.some((row) => row.session.path === selectedSessionPath)) {
      // Expand at most once per selection; after that the user owns showAll.
      suppressAutoExpandPathRef.current = selectedSessionPath;
      requestAnimationFrame(() => {
        if (!showAllRef.current) {
          setShowAll(true);
        }
      });
    }
  }, [selectedSessionPath, rows]);

  const visibleRows = showAll ? rows : rows.slice(0, visibleSessionCount);
  const hiddenCount = rows.length - visibleRows.length;

  function handleSessionSwitch(session: PiSessionInfo): void {
    // Clicked items are visible by definition (hidden items aren't rendered),
    // so auto-expand must never fire for this selection — even if a later
    // session-list refresh re-runs the effect after the user collapsed the
    // list.
    suppressAutoExpandPathRef.current = session.path;
    onResumeSession(session);
  }

  const showList = isExpanded || isCollapsedWithPinned;

  return (
    <>
      <div
        aria-hidden={!showList}
        className={
          showList
            ? 'grid grid-rows-[1fr] translate-y-0 opacity-100 transition-[grid-template-rows,opacity,transform] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
            : 'grid grid-rows-[0fr] -translate-y-1 opacity-0 transition-[grid-template-rows,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
        }
      >
        <div className="min-h-0 overflow-hidden">
          <SidebarMenuSub className="mx-0 border-l-0 px-0">
            {projectSessions.length === 0 ? (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  className="w-full justify-start pl-6 text-left text-muted-foreground"
                >
                  <span aria-disabled>No chats yet</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ) : (
              visibleRows.map((row) => (
                <SessionItem
                  key={row.session.path}
                  row={row}
                  isActive={row.session.path === selectedSessionPath}
                  isRunning={isSessionRunning(row.session.path, sessions)}
                  relativeTimeBase={relativeTimeBase}
                  onSwitch={() => handleSessionSwitch(row.session)}
                  onRename={(name) => onRenameSession(row.session.path, name)}
                />
              ))
            )}
            {hiddenCount > 0 && !isCollapsedWithPinned && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  className="w-full justify-start pl-6 text-left text-muted-foreground"
                >
                  <button type="button" onClick={() => setShowAll(true)}>
                    <span>Show more</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        </div>
      </div>
      {showList && showAll && rows.length > visibleSessionCount && !isCollapsedWithPinned && (
        <SidebarMenuSub
          data-show-all
          className="sticky bottom-0 z-10 mx-0 border-l-0 px-0 py-0 gap-0 bg-muted rounded-md hover:bg-[#e5e5e5]"
        >
          <SidebarMenuSubItem>
            <SidebarMenuSubButton
              asChild
              className="w-full justify-start pl-6 text-left text-muted-foreground hover:bg-transparent"
            >
              <button type="button" onClick={() => setShowAll(false)}>
                <span>Show less</span>
              </button>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      )}
    </>
  );
}
