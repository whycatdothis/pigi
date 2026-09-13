import React from 'react';
import { IconChevronRight, IconUser } from '@tabler/icons-react';
import type { ItemInstance, TreeInstance } from '@headless-tree/core';
import type { SessionTreeEntry } from '../../../../shared/ipcContract';
import {
  describeSessionTreeEntry,
  describeSessionTreeRow,
  formatSessionTreeTime,
  type SessionTreeData,
  type SessionTreeItem,
} from '../../lib/sessionTreeData';
import { cn } from '../../lib/utils';
import { CHEVRON_PX, ROW_HEIGHT_PX, rowContentX } from './sessionTreeGeometry';

/**
 * State the whole row recursion shares.
 *
 * Threading one object keeps the recursion (a row, its continuation, its
 * branches) readable: every level needs the same handlers, the same tree and
 * the same hovered path.
 */
export interface SessionTreeRowContext {
  data: SessionTreeData;
  tree: TreeInstance<SessionTreeItem>;
  currentId: string | null;
  /** The row the branch tinting is for; null only before the first render. */
  litRowId: string | null;
  onSelect: (entryId: string) => void;
  onToggleFold: (item: ItemInstance<SessionTreeItem>) => void;
  onRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntry) => void;
  onRowLeave: () => void;
}

interface TreeRowProps {
  item: ItemInstance<SessionTreeItem>;
  /** ARIA level: the nesting the user sees, not the message tree's depth. */
  level: number;
  /** Indent of this row's content; `level` counts from one, depth from zero. */
  depth: number;
  /**
   * The row is a fork's direct child, so it hangs from a branch line and
   * folding it hides a branch rather than hiding a continuation.
   */
  isBranchChild: boolean;
  /** Character positions of the fuzzy match inside the row text. */
  matchIndexes: number[] | undefined;
  isCurrent: boolean;
  rowContext: SessionTreeRowContext;
}

export function TreeRow({
  item,
  level,
  depth,
  isBranchChild,
  matchIndexes,
  isCurrent,
  rowContext,
}: TreeRowProps): React.JSX.Element | null {
  const { onSelect, onToggleFold, onRowEnter, onRowLeave } = rowContext;
  const entry = item.getItemData().entry;
  if (!entry) return null;

  const matched = matchIndexes !== undefined;
  const { canFold, description, isMetaKind, isError } = describeSessionTreeRow(item, isBranchChild);

  return (
    <button
      {...item.getProps()}
      type="button"
      // Announce the indentation the user sees, not the message tree's depth.
      aria-level={level}
      // The library's default click folds folders; here a click moves the
      // session, and the chevron (or the arrow keys) folds.
      onClick={() => {
        item.setFocused();
        onSelect(entry.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onSelect(entry.id);
      }}
      className={cn(
        // The row spans the list, so the gutter a branch line runs through stays
        // part of its click and hover target; the highlight itself sits on the
        // content box below, which starts where the row's content starts.
        'group flex w-full items-center text-left text-[13px] text-foreground outline-none select-none',
      )}
      style={{ height: ROW_HEIGHT_PX, paddingLeft: rowContentX(depth) }}
      data-tree-current={isCurrent ? 'true' : undefined}
      data-tree-match={matched ? 'true' : undefined}
      data-tree-row-id={item.getId()}
      data-testid="session-tree-row"
      onMouseEnter={(event) => onRowEnter(event, entry)}
      onMouseLeave={onRowLeave}
    >
      <span
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pr-2',
          // Hover is read off the row (a `group-hover`), so pointing at the
          // indentation highlights the same box as pointing at the text. One
          // hover class for every row: the current row is marked by its chip,
          // not by a background, so hover reads the same wherever it lands.
          'group-hover:bg-foreground/10',
          matched && 'bg-muted/50',
          !matched && isMetaKind && 'bg-muted/40',
        )}
      >
        <TreeRowContent
          item={item}
          entry={entry}
          description={description}
          canFold={canFold}
          isError={isError}
          isCurrent={isCurrent}
          matchIndexes={matchIndexes}
          onToggleFold={() => onToggleFold(item)}
        />
      </span>
    </button>
  );
}

interface TreeRowContentProps {
  item: ItemInstance<SessionTreeItem>;
  entry: SessionTreeEntry;
  description: ReturnType<typeof describeSessionTreeEntry>;
  canFold: boolean;
  isError: boolean;
  /** The session's position: marked with a chip, never with a background. */
  isCurrent: boolean;
  /** Skipped for the copy the pinned list shows: it is not a control there. */
  matchIndexes?: number[];
  onToggleFold?: () => void;
}

/**
 * The row's insides, shared by the list and by the pinned copies at its top.
 *
 * A pinned row has to be recognisable as the row it stands for, so it renders
 * the same content — only the shell around it differs.
 */
export function TreeRowContent({
  item,
  entry,
  description,
  canFold,
  isError,
  isCurrent,
  matchIndexes,
  onToggleFold,
}: TreeRowContentProps): React.JSX.Element {
  return (
    <>
      <span
        className={cn(
          'relative flex shrink-0 items-center justify-center text-muted-foreground',
          !canFold && 'invisible',
        )}
        style={{ width: CHEVRON_PX, height: CHEVRON_PX }}
        aria-hidden="true"
        onClick={
          onToggleFold
            ? (event) => {
                event.stopPropagation();
                onToggleFold();
              }
            : undefined
        }
      >
        {/*
          The chevron is small, so folding gets a hit area as tall as the row: a
          near miss must not land on the row, where a click moves the session
          instead. Only the real rows take it — the pinned copies navigate.
        */}
        {onToggleFold && <span className="absolute" style={{ inset: '-8px -6px' }} />}
        <IconChevronRight
          size={16}
          // Default stroke: at 16px the chevron is already bigger than the icons
          // around it, and a thicker line reads as bold next to them.
          className={cn('transition-transform', item.isExpanded() && 'rotate-90')}
        />
      </span>

      {/* Only the user's own turns are marked: they are the stops a rewind
          really rewinds to, everything else is content in between. */}
      {entry.kind === 'user' && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--system-accent)]/12 text-[var(--system-accent)]">
          <IconUser size={13} className="[stroke-width:2.5]" />
        </span>
      )}

      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          description.monospace && 'font-mono text-xs',
          isError && 'text-destructive',
          !isError && entry.kind === 'user' && 'font-medium text-foreground',
          !isError && entry.kind === 'assistant' && 'text-foreground/80',
          !isError &&
            entry.kind !== 'user' &&
            entry.kind !== 'assistant' &&
            'text-muted-foreground',
        )}
        data-tree-row-text="true"
      >
        {renderMatchHighlight(description.text, matchIndexes)}
      </span>

      {isCurrent && (
        // A chip rather than a tinted row: the position has to be readable while
        // the pointer is on it, and a background would be covered by the hover.
        <span className="shrink-0 rounded-sm bg-[var(--system-accent)]/12 px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--system-accent)]">
          Current
        </span>
      )}

      {description.trailing && (
        <span
          className={cn(
            'shrink-0 text-[11px] text-muted-foreground',
            isError && 'text-destructive',
          )}
        >
          {description.trailing}
        </span>
      )}

      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {formatSessionTreeTime(entry.timestamp)}
      </span>
    </>
  );
}

/** Wrap the fuzzy-matched characters in `text`; adjacent matches share a mark. */
function renderMatchHighlight(text: string, indexes: number[] | undefined): React.ReactNode {
  if (!indexes || indexes.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let runStart = -1;
  let runEnd = -1;

  const flushRun = (): void => {
    if (runStart < 0) return;
    if (runStart > cursor) nodes.push(text.slice(cursor, runStart));
    nodes.push(
      <mark key={runStart} className="rounded-sm bg-[var(--system-accent)]/20 text-inherit">
        {text.slice(runStart, runEnd + 1)}
      </mark>,
    );
    cursor = runEnd + 1;
    runStart = -1;
    runEnd = -1;
  };

  for (const index of indexes) {
    if (index <= runEnd) continue;
    if (runStart < 0) {
      runStart = index;
      runEnd = index;
      continue;
    }
    if (index === runEnd + 1) {
      runEnd = index;
      continue;
    }
    flushRun();
    runStart = index;
    runEnd = index;
  }
  flushRun();
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
