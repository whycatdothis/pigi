import React from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { formatSessionTreeTime, type SessionTreeRootStats } from '../../lib/sessionTreeData';
import { cn } from '../../lib/utils';
import { SessionTreeIcon } from './sessionTreeIcons';

interface TreeHeaderProps {
  /** Number shown to the user, counted from the oldest tree. */
  position: number;
  isCurrent: boolean;
  expanded: boolean;
  stats: SessionTreeRootStats | undefined;
  isFirst: boolean;
  onToggle: () => void;
}

/**
 * Section header for one of the session's trees.
 *
 * It tells the reader which version they are in and folds the whole tree away —
 * the escape hatch for keeping every other version reachable. The pinned band
 * keeps the line of the tree the top rows belong to in view; this is the one in
 * the flow of the list, which scrolls under it.
 *
 * The line itself: chevron, `Tree N`, how many messages and the time span.
 *
 * Split out so the pinned band can draw the same line where the header would be
 * if it were still on screen — with several versions in one file, the band holds
 * the header of the tree its rows belong to, and the space it takes is what keeps
 * the band from being a see-through strip.
 */
export function TreeHeaderContent({
  position,
  isCurrent,
  expanded,
  stats,
}: Omit<TreeHeaderProps, 'isFirst' | 'onToggle'>): React.JSX.Element {
  const range = stats ? formatTreeRange(stats) : '';
  return (
    <>
      <IconChevronRight
        size={16}
        className={cn(
          'shrink-0 text-muted-foreground transition-transform',
          expanded && 'rotate-90',
        )}
      />
      <span
        className={cn(
          'text-[11px] font-medium tracking-wide',
          isCurrent ? 'text-[var(--system-accent)]' : 'text-muted-foreground',
        )}
      >
        <SessionTreeIcon size={14} className="mr-1 inline-block align-[-3px] [stroke-width:2.5]!" />
        Tree {position}
      </span>
      {stats && (
        <span className="text-[11px] text-muted-foreground/80">
          {stats.rowCount} {stats.rowCount === 1 ? 'message' : 'messages'}
        </span>
      )}
      {range !== '' && (
        <span className="ml-auto font-mono text-[11px] text-muted-foreground/60 tabular-nums">
          {range}
        </span>
      )}
    </>
  );
}

/**
 * The header's surface. Opaque stand-in for the dialog's own surface: a
 * translucent header would tint a second time (a 6-level white band in light
 * mode) and let the rows scroll through it.
 *
 * Not sticky: with several trees the band holds this line at the top for as long
 * as the list is anywhere in that tree, which is what a sticky header would have
 * been for — and one owner of that space is one place to get it right.
 */
export const TREE_HEADER_CLASS_NAME =
  'flex w-full cursor-pointer items-center gap-2 bg-[var(--dialog-solid)] px-2 py-1.5 text-left whitespace-nowrap';

export function TreeHeader({
  position,
  isCurrent,
  expanded,
  stats,
  isFirst,
  onToggle,
}: TreeHeaderProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      // One line, always: the list's item arithmetic assumes every header is the
      // same height, and it is measured once.
      className={cn(
        TREE_HEADER_CLASS_NAME,
        '-mx-2 w-[calc(100%+1rem)]',
        !isFirst && 'border-t border-border/60',
      )}
      data-testid="session-tree-root-header"
    >
      <TreeHeaderContent
        position={position}
        isCurrent={isCurrent}
        expanded={expanded}
        stats={stats}
      />
    </button>
  );
}

/** "09:12 – 11:44", or a single time when a tree spans one minute. */
function formatTreeRange(stats: SessionTreeRootStats): string {
  const start = formatSessionTreeTime(stats.startTimestamp);
  const end = formatSessionTreeTime(stats.endTimestamp);
  return start === end ? start : `${start} – ${end}`;
}
