import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { IconChevronDown, IconChevronRight, IconLoader2, IconPencil } from '@tabler/icons-react';
import { useTypewriter } from '../../hooks/useTypewriter';
import type { PiSessionInfo } from '../../../../shared/ipcContract';
import { useAppStore, type SessionEntry } from '../../state/appStore';
import {
  buildLineage,
  flattenLineage,
  revealPath,
  rowsOfFirstRoots,
  type LineageRow,
  type SessionLineageRow,
  type SubagentGroupRow,
} from '../../lib/sessionLineage';
import { useRenameSuppress } from '../../hooks/useRenameSuppress';
import { SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '../ui/sidebar';
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { SpinningIcon } from '../ui/spinningIcon';
import { formatRelativeTime } from '../../lib/utils';
import { formatDateTime, getSessionTitle, isSessionRunning } from './utils';

const SESSION_ROW_CLASS_NAME = 'w-full justify-start pl-6 text-left text-sidebar-foreground/85';

interface SessionItemProps {
  row: SessionLineageRow;
  isActive: boolean;
  isRunning: boolean;
  relativeTimeBase: number;
  onSwitch: () => void;
  onRename: (name: string) => void;
}

/**
 * Fork connector: one 12px column (at the default text size) per ancestor
 * level, so a row's line runs
 * under its parent's title, plus a short tick into this row. The row's own
 * column is only as wide as the tick, and the title follows it closely: the
 * sidebar has little room. Lines stop at the row's edge, leaving a break
 * between rows.
 */
// In --spacing units, so the columns scale with the row's padding.
const LINEAGE_INDENT_UNITS = 3;
const LINEAGE_TICK_UNITS = 2;
const spacingUnits = (units: number): string => `calc(var(--spacing) * ${units})`;
const LINEAGE_MAX_DEPTH = 3;

function LineagePrefix({
  row,
}: {
  row: Pick<LineageRow, 'depth' | 'isLast' | 'ancestorContinues'>;
}): React.JSX.Element | null {
  if (row.depth === 0) return null;
  // Deeper forks than the indent step allows keep the innermost columns:
  // a staircase off the sidebar's edge says less than the last few levels do.
  const columnCount = Math.min(row.depth, LINEAGE_MAX_DEPTH);
  const firstColumn = row.depth - columnCount;

  return (
    <span
      aria-hidden="true"
      data-lineage-depth={row.depth}
      className="-mr-0.5 flex shrink-0 self-stretch"
      style={{ width: spacingUnits((columnCount - 1) * LINEAGE_INDENT_UNITS + LINEAGE_TICK_UNITS) }}
    >
      {Array.from({ length: columnCount }, (_, offset) => {
        const column = firstColumn + offset;
        const isOwnColumn = column === row.depth - 1;
        const continues = isOwnColumn ? !row.isLast : (row.ancestorContinues[column] ?? false);
        return (
          <span
            key={column}
            className="relative shrink-0"
            style={{ width: spacingUnits(isOwnColumn ? LINEAGE_TICK_UNITS : LINEAGE_INDENT_UNITS) }}
          >
            {continues ? (
              <span className="absolute inset-y-0 left-0 w-px bg-foreground/15" />
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

/** Right-side slot of a session row: running spinner, unread dot, or relative time. */
function SessionTrailing({
  session,
  isRunning,
  isUnread,
  relativeTimeBase,
}: {
  session: PiSessionInfo;
  isRunning: boolean;
  isUnread: boolean;
  relativeTimeBase: number;
}): React.JSX.Element {
  if (isRunning) {
    return (
      <SpinningIcon className="ml-2 animate-[spin_1.8s_linear_infinite]">
        <IconLoader2 className="size-3.5 text-sidebar-accent-foreground" />
      </SpinningIcon>
    );
  }
  if (isUnread) {
    return (
      <span
        role="status"
        aria-label="Unread"
        className="ml-2 size-2 shrink-0 rounded-full bg-[var(--system-accent)]"
      />
    );
  }
  const modifiedTime = session.modified || session.created;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-2 shrink-0 text-caption text-muted-foreground">
          {formatRelativeTime(modifiedTime, relativeTimeBase)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-caption flex flex-col gap-0.5 items-start">
        <div>Created: {formatDateTime(session.created)}</div>
        {session.modified && <div>Updated: {formatDateTime(session.modified)}</div>}
      </TooltipContent>
    </Tooltip>
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
  const isUnread = useAppStore((state) => state.unreadSessionPaths.has(session.path));
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

  if (isEditing) {
    return (
      <SidebarMenuSubItem data-session-path={session.path}>
        <SidebarMenuSubButton asChild isActive={isActive} className={SESSION_ROW_CLASS_NAME}>
          <div>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={handleKeyDown}
              autoFocus
              className="min-w-0 flex-1 truncate bg-transparent text-body outline-none caret-foreground"
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
          {row.hasChildren && <CollapseToggle row={row} />}
          <SidebarMenuSubButton asChild isActive={isActive} className={SESSION_ROW_CLASS_NAME}>
            <button type="button" onClick={onSwitch} onDoubleClick={handleStartRename}>
              <LineagePrefix row={row} />
              <span className="min-w-0 flex-1 truncate text-left" title={getSessionTitle(session)}>
                {displayTitle}
              </span>
              <SessionTrailing
                session={session}
                isRunning={isRunning}
                isUnread={isUnread}
                relativeTimeBase={relativeTimeBase}
              />
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

/**
 * Hides or shows a session's forks and subagent group, in the row's left
 * gutter: a sibling of the row's button, which cannot hold another button.
 */
function CollapseToggle({ row }: { row: SessionLineageRow }): React.JSX.Element {
  const setCollapsed = useAppStore((state) => state.setSessionChildrenCollapsed);
  const Chevron = row.collapsed ? IconChevronRight : IconChevronDown;
  return (
    <button
      type="button"
      aria-expanded={!row.collapsed}
      aria-label={row.collapsed ? 'Show forks and subagents' : 'Hide forks and subagents'}
      onClick={() => setCollapsed([row.session.path], !row.collapsed)}
      className="absolute left-1 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Chevron className="size-3.5" />
    </button>
  );
}

/**
 * A parent's subagents folded into one row: how many, how many are running,
 * and the latest activity among them. Clicking opens the group. Neither a
 * spinner nor an unread dot: subagents run and finish unattended all the
 * time, and the label already says how many run; their own rows show more.
 */
function SubagentGroupItem({
  row,
  sessions,
  relativeTimeBase,
}: {
  row: SubagentGroupRow;
  sessions: Map<string, SessionEntry>;
  relativeTimeBase: number;
}): React.JSX.Element {
  const setExpanded = useAppStore((state) => state.setSubagentGroupsExpanded);
  const runningCount = row.sessions.filter((session) =>
    isSessionRunning(session.path, sessions),
  ).length;
  const latest = row.sessions.reduce((newest, session) =>
    (session.modified || session.created) > (newest.modified || newest.created) ? session : newest,
  );
  const count = row.sessions.length;
  const label = `${count} ${count === 1 ? 'subagent' : 'subagents'}${
    runningCount > 0 ? `, ${runningCount} running` : ''
  }`;

  return (
    <SidebarMenuSubItem data-subagent-group={row.parentPath}>
      <SidebarMenuSubButton asChild className={SESSION_ROW_CLASS_NAME}>
        <button
          type="button"
          aria-expanded={row.expanded}
          onClick={() => setExpanded([row.parentPath], !row.expanded)}
        >
          <LineagePrefix row={row} />
          <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">{label}</span>
          <SessionTrailing
            session={latest}
            isRunning={false}
            isUnread={false}
            relativeTimeBase={relativeTimeBase}
          />
        </button>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

/** Sessions a project shows before "Show more"; forks and subagents come with their root. */
const VISIBLE_ROOT_COUNT = 5;

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
  const lineage = useMemo(() => buildLineage(renderedSessions), [renderedSessions]);
  const expandedGroups = useAppStore((state) => state.expandedSubagentGroups);
  const collapsedParents = useAppStore((state) => state.collapsedSessionParents);
  const rows = useMemo(
    () => flattenLineage(lineage, expandedGroups, collapsedParents),
    [lineage, expandedGroups, collapsedParents],
  );
  const collapsedRowCount = useMemo(() => rowsOfFirstRoots(rows, VISIBLE_ROOT_COUNT), [rows]);

  // A selection under a collapsed session or inside a collapsed subagent group
  // (from the CLI, the switcher or navigation history) opens them, so the
  // selected row exists; the "show more" expansion below then applies to it
  // like to any row. Once per selection, as with "show more": a list refresh
  // must not reopen what the user closed.
  const revealedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedSessionPath || revealedPathRef.current === selectedSessionPath) return;
    const { ancestors, subagentGroups } = revealPath(lineage, selectedSessionPath);
    if (ancestors.length > 0) {
      revealedPathRef.current = selectedSessionPath;
      const store = useAppStore.getState();
      store.setSessionChildrenCollapsed(ancestors, false);
      store.setSubagentGroupsExpanded(subagentGroups, true);
    }
  }, [lineage, selectedSessionPath]);

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
    const hidden = rows.slice(collapsedRowCount);
    if (hidden.some((row) => row.kind === 'session' && row.session.path === selectedSessionPath)) {
      // Expand at most once per selection; after that the user owns showAll.
      suppressAutoExpandPathRef.current = selectedSessionPath;
      requestAnimationFrame(() => {
        if (!showAllRef.current) {
          setShowAll(true);
        }
      });
    }
  }, [selectedSessionPath, rows, collapsedRowCount]);

  const visibleRows = showAll ? rows : rows.slice(0, collapsedRowCount);
  const hiddenCount = rows.length - visibleRows.length;

  function handleSessionSwitch(session: PiSessionInfo): void {
    // Clicked items are visible by definition (hidden items aren't rendered),
    // so auto-expand must never fire for this selection.
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
            ? 'grid grid-rows-[1fr] translate-y-0 opacity-100 transition-[grid-template-rows,opacity,transform] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] reduce-motion:transition-none'
            : 'grid grid-rows-[0fr] -translate-y-1 opacity-0 transition-[grid-template-rows,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] reduce-motion:transition-none'
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
              visibleRows.map((row) =>
                row.kind === 'subagents' ? (
                  <SubagentGroupItem
                    key={`subagents:${row.parentPath}`}
                    row={row}
                    sessions={sessions}
                    relativeTimeBase={relativeTimeBase}
                  />
                ) : (
                  <SessionItem
                    key={row.session.path}
                    row={row}
                    isActive={row.session.path === selectedSessionPath}
                    isRunning={isSessionRunning(row.session.path, sessions)}
                    relativeTimeBase={relativeTimeBase}
                    onSwitch={() => handleSessionSwitch(row.session)}
                    onRename={(name) => onRenameSession(row.session.path, name)}
                  />
                ),
              )
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
      {showList && showAll && rows.length > collapsedRowCount && !isCollapsedWithPinned && (
        <SidebarMenuSub
          data-show-all
          className="sticky bottom-0 z-10 mx-0 border-l-0 px-0 py-0 gap-0 bg-muted rounded-control hover:bg-accent"
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
