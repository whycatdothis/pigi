import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { collectBranchOwners, describeSessionTreeRow } from '../../lib/sessionTreeData';
import { cn } from '../../lib/utils';
import { ROW_HEIGHT_PX, rowContentX } from './sessionTreeGeometry';
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
  containerRef: React.RefObject<HTMLDivElement | null>;
  parentById: ReadonlyMap<string, string>;
  depthById: ReadonlyMap<string, number>;
  /**
   * The number of rows the tree instance reports; a first measurement after a
   * fold the tree owns. What is actually in the list is read from the DOM (see
   * `measure`), so this is a starting point, not the source of truth.
   */
  visibleRowCount: number;
  rowContext: SessionTreeRowContext;
}

/**
 * The branch line the list is currently showing, pinned to its top.
 *
 * Scrolling past a fork used to hide who the visible rows hang from. This
 * mirrors the list with the ancestors of the top-most visible row — one row per
 * indent level, so the stack is as tall as the nesting, not as long as the
 * conversation. It sticks above the rows (`z-20`) and takes no space in the
 * flow, so nothing shifts when it appears.
 */
export function PinnedAncestors({
  containerRef,
  parentById,
  depthById,
  visibleRowCount,
  rowContext,
}: PinnedAncestorsProps): React.JSX.Element | null {
  const [pinned, setPinned] = useState<{ id: string; depth: number }[]>([]);
  /** Height of the tree header band, so the stack starts under it. */
  const [headerHeight, setHeaderHeight] = useState(0);
  const layoutRef = useRef<{ ids: string[]; tops: number[]; headerHeight: number }>({
    ids: [],
    tops: [],
    headerHeight: 0,
  });

  const update = useCallback((): void => {
    const container = containerRef.current;
    if (!container) return;
    const { ids, tops, headerHeight } = layoutRef.current;
    if (ids.length === 0) {
      setPinned((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    // The row the reader is looking at: the last one that starts above the
    // header band. Its own height does not count, so the stack cannot push
    // itself into a different answer.
    const threshold = container.scrollTop + headerHeight;
    let index = 0;
    for (let candidate = 0; candidate < tops.length; candidate += 1) {
      if (tops[candidate] > threshold) break;
      index = candidate;
    }
    const next = collectBranchOwners(ids[index], parentById, depthById);
    setPinned((previous) =>
      previous.length === next.length && previous.every((row, i) => row.id === next[i].id)
        ? previous
        : next,
    );
  }, [containerRef, depthById, parentById]);

  /**
   * Read every row's offset once per row set.
   *
   * Re-measuring on scroll would be the expensive part of this feature (a
   * forced layout per frame), so the offsets are cached until the rows change
   * — which folding, filtering, a live refresh and the search box all do, and
   * which the id list read below detects without touching layout.
   */
  const measure = useCallback((): void => {
    const container = containerRef.current;
    if (!container) return;
    const elements = [...container.querySelectorAll<HTMLElement>('[data-tree-row-id]')];
    const ids = elements.map((element) => element.dataset.treeRowId ?? '');
    const previous = layoutRef.current.ids;
    // Reading every row's offset forces a layout, so it only happens when the
    // rows themselves changed. Counting them is not enough: a filter can swap
    // one row for another, and folding a whole tree leaves the count alone.
    if (ids.length === previous.length && ids.every((id, index) => id === previous[index])) {
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const header = container.querySelector<HTMLElement>('[data-testid=session-tree-root-header]');
    const measuredHeaderHeight = header?.getBoundingClientRect().height ?? 0;
    layoutRef.current = {
      ids,
      tops: elements.map((element) => element.getBoundingClientRect().top - containerTop),
      headerHeight: measuredHeaderHeight,
    };
    setHeaderHeight(measuredHeaderHeight);
    update();
  }, [containerRef, update]);

  useLayoutEffect(() => {
    measure();
  }, [measure, visibleRowCount]);

  // Which rows are in the list — a live refresh, a filter, a fold — is only
  // visible in the DOM, so the layout follows the DOM instead of guessing from
  // state. Moving the pointer over the rows mutates nothing, so this stays quiet.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new MutationObserver(() => {
      measure();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [containerRef, measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const onScroll = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [containerRef, update]);

  if (pinned.length === 0) return null;

  return (
    <div
      className="sticky top-0 z-20 h-0"
      style={{ paddingTop: headerHeight }}
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
