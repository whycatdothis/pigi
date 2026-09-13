import React, { useEffect, useMemo, useState } from 'react';
import { collectBranchOwners, describeSessionTreeRow } from '../../lib/sessionTreeData';
import { cn } from '../../lib/utils';
import { ROW_HEIGHT_PX, rowContentX } from './sessionTreeGeometry';
import { findTopRowIndex, type SessionTreeListItem } from './sessionTreeListModel';
import { TreeRowContent, type SessionTreeRowContext } from './SessionTreeRow';

/** Opaque stand-in for the dialog's surface, like the tree headers use. */
const PINNED_BG = 'var(--dialog-solid)';

interface PinnedRowProps {
  itemId: string;
  /** The row's indent level; the pinned stack steps outward to the root. */
  depth: number;
  /** The bottom-most pinned row carries the edge that ends the band. */
  isLast: boolean;
  rowContext: SessionTreeRowContext;
}

/**
 * One ancestor row, pinned to the top of the list.
 *
 * It is a copy: the same content, the same indent, an opaque background so rows
 * scrolling underneath stay hidden. Clicking it moves the session like the row
 * itself would.
 */
function PinnedRow({
  itemId,
  depth,
  isLast,
  rowContext,
}: PinnedRowProps): React.JSX.Element | null {
  const { tree, currentId, onSelect } = rowContext;
  const item = tree.getItemInstance(itemId);
  const entry = item.getItemData().entry;
  if (!entry) return null;
  const { canFold, description, isError } = describeSessionTreeRow(item, true);

  return (
    <div
      className={cn('group flex w-full items-center', isLast && 'border-b border-border/60')}
      style={{ height: ROW_HEIGHT_PX, paddingLeft: rowContentX(depth), background: PINNED_BG }}
      data-testid="session-tree-pinned-row"
      data-tree-pinned-id={itemId}
      onClick={() => onSelect(entry.id)}
    >
      <span
        className={cn(
          'flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pr-2',
          // The same hover the rows themselves use: the pinned copies must read
          // as rows, so they hover like them.
          'group-hover:bg-foreground/10',
        )}
      >
        <TreeRowContent
          item={item}
          entry={entry}
          description={description}
          canFold={canFold}
          isError={isError}
          isCurrent={entry.id === currentId}
        />
      </span>
    </div>
  );
}

interface PinnedAncestorsProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  items: readonly SessionTreeListItem[];
  /** Where every item starts, in scroll-content pixels. */
  offsets: readonly number[];
  parentById: ReadonlyMap<string, string>;
  depthById: ReadonlyMap<string, number>;
  /**
   * What the band itself takes up above the rows: the sticky headers' height, or
   * nothing when a session has a single tree. The offsets are relative to where
   * the rows start, so the scroll offset has to be read against the same origin.
   */
  contentOffsetPx: number;
  rowContext: SessionTreeRowContext;
}

/**
 * The branch line the list is currently showing, pinned to its top.
 *
 * Scrolling past a fork used to hide who the visible rows hang from. This
 * mirrors the list with the forks the top-most visible row hangs from — one row
 * per indent level, so the stack is as tall as the nesting, not as long as the
 * conversation. It sticks above the rows (`z-20`) and takes no space in the
 * flow, so nothing shifts when it appears.
 *
 * Which row that is comes out of the scroll offset and the item heights: the
 * rows it names are usually not rendered at all, so measuring them is not an
 * option, and arithmetic is exact here because only the headers are measured.
 */
export function PinnedAncestors({
  scrollRef,
  items,
  offsets,
  parentById,
  depthById,
  contentOffsetPx,
  rowContext,
}: PinnedAncestorsProps): React.JSX.Element | null {
  const [scrollTopPx, setScrollTopPx] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const onScroll = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTopPx(element.scrollTop);
      });
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    setScrollTopPx(element.scrollTop);
    return () => {
      element.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scrollRef]);

  const topRowIndex = findTopRowIndex(
    items,
    offsets,
    scrollTopPx - contentOffsetPx,
    contentOffsetPx,
  );
  const topRowItemId =
    topRowIndex === null || items[topRowIndex]?.kind !== 'row'
      ? null
      : items[topRowIndex].row.itemId;
  const pinned = useMemo(
    () => (topRowItemId === null ? [] : collectBranchOwners(topRowItemId, parentById, depthById)),
    [topRowItemId, parentById, depthById],
  );

  if (pinned.length === 0) return null;

  return (
    <div
      className="sticky top-0 z-20 h-0"
      style={{ paddingTop: contentOffsetPx }}
      aria-hidden="true"
      data-testid="session-tree-pinned"
    >
      {pinned.map((ancestor, index) => (
        <PinnedRow
          key={ancestor.id}
          itemId={ancestor.id}
          depth={ancestor.depth}
          isLast={index === pinned.length - 1}
          rowContext={rowContext}
        />
      ))}
    </div>
  );
}
