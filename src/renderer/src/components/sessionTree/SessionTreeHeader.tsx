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
 * It pins to the top of the list, so in a long tree the user still knows which
 * version they are reading, and it folds the whole tree away — the escape hatch
 * for keeping every other version reachable.
 */
export function TreeHeader({
  position,
  isCurrent,
  expanded,
  stats,
  isFirst,
  onToggle,
}: TreeHeaderProps): React.JSX.Element {
  const range = stats ? formatTreeRange(stats) : '';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        // Opaque stand-in for the dialog's own surface: a translucent header
        // would tint a second time (a 6-level white band in light mode) and let
        // the rows scroll through it.
        // One line, always: the list's item arithmetic assumes every header is
        // the same height, and it is measured once.
        'sticky top-0 z-10 -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 bg-[var(--dialog-solid)] px-2 py-1.5 text-left whitespace-nowrap',
        !isFirst && 'border-t border-border/60',
      )}
      data-testid="session-tree-root-header"
    >
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
    </button>
  );
}

/** "09:12 – 11:44", or a single time when a tree spans one minute. */
function formatTreeRange(stats: SessionTreeRootStats): string {
  const start = formatSessionTreeTime(stats.startTimestamp);
  const end = formatSessionTreeTime(stats.endTimestamp);
  return start === end ? start : `${start} – ${end}`;
}
