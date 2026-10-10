import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SessionTreeEntry } from '../../../../shared/ipcContract';
import {
  buildSessionTreeRows,
  canFoldRow,
  collectPathOwners,
  type SessionTreeData,
  type SessionTreeFlatRow,
} from '../../lib/sessionTreeData';
import {
  BRANCH_ELBOW_TOP_PX,
  BRANCH_ELBOW_WIDTH_PX,
  BRANCH_SPACING_PX,
  RAIL_WIDTH_PX,
  chevronCentreX,
  railColor,
} from './sessionTreeGeometry';
import {
  DEFAULT_TREE_HEADER_HEIGHT_PX,
  buildSessionTreeListItems,
  collectRailSpans,
  findLitRowId,
  isRailOwner,
  listItemHeightPx,
  listItemOffsetsPx,
  type SessionTreeListItem,
} from './sessionTreeListModel';
import { TreeHeader } from './SessionTreeHeader';
import { PinnedAncestors } from './SessionTreePinnedBand';
import { SessionTreeRails } from './SessionTreeRails';
import { TreeRow, type SessionTreeRowContext } from './SessionTreeRow';

/** What the search box drives while it keeps the caret. */
export interface SessionTreeListHandle {
  /**
   * Move the keyboard's row by `step` rows without taking the focus. With no row
   * selected yet, the first step lands on the first row.
   */
  moveSelection: (step: number) => void;
  /**
   * The row Enter takes: where the arrow keys moved to, the first match after a
   * search, or the first row of the list. Taking the first row of a search would
   * land on the ancestor that carries the match.
   */
  enterTargetId: () => string | null;
}

interface SessionTreeListProps {
  ref?: React.Ref<SessionTreeListHandle>;
  data: SessionTreeData;
  currentId: string | null;
  /** Only the first dataset of a visit scrolls; a live refresh must not. */
  autoScroll: boolean;
  /** Folded-away trees: their rows are left out of the list entirely. */
  collapsedTreeIds: ReadonlySet<string>;
  onToggleTree: (treeId: string) => void;
  /** The row whose line the pointer is on; its path lights up. */
  hoverRowId: string | null;
  onSelect: (entryId: string) => void;
  onRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntry) => void;
  onRowLeave: () => void;
  /** The hovered row, or null when the pointer left the rows. */
  onRowPath: (rowId: string | null) => void;
}

/** A row's key in the virtualizer: stable across a move of the window. */
function listItemKey(item: SessionTreeListItem): string {
  return item.kind === 'header' ? `header:${item.treeId}` : `row:${item.row.itemId}`;
}

/**
 * The scrolling list: the tree, its version headers and the pinned ancestors.
 *
 * The rows are a flat list — the tree's nesting is only how they are ordered —
 * and only the ones on screen are rendered. Everything else is arithmetic over
 * that order: where a row starts (`listItemOffsetsPx`), which row is at the top
 * of the viewport (the pinned band) and where the branch lines run
 * (`collectRailSpans`). Row heights are constants and headers are measured, so
 * the arithmetic is exact for rows that are nowhere near the DOM.
 */
export function SessionTreeList({
  ref,
  data,
  currentId,
  autoScroll,
  collapsedTreeIds,
  onToggleTree,
  hoverRowId,
  onSelect,
  onRowEnter,
  onRowLeave,
  onRowPath,
}: SessionTreeListProps): React.JSX.Element {
  // Every row starts unfolded, and so does a row a live refresh adds. Versions
  // fold as a whole (`collapsedTreeIds` in the dialog), not through their rows.
  const [foldedItemIds, setFoldedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  // What the keyboard is on after a search or a filter: the first match, so the
  // row Enter would take is the row the list shows as selected.
  const [chosenId, setChosenId] = useState<string | null>(
    () => data.matchIndexesById.keys().next().value ?? null,
  );
  /** A row the arrow keys moved to inside the list; it takes the focus once rendered. */
  const pendingFocusIdRef = useRef<string | null>(null);
  /** The list has been to the current row once; it does not go back on its own. */
  const scrolledToCurrentRef = useRef(false);
  /** The keyboard row the list last brought into view. */
  const revealedIdRef = useRef<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // The rows the list shows (folds and filters applied). This is the expensive
  // part — one walk of the visible session — so it is memoised on the things that
  // can change it, and not on the row the light is on: a pointer moving along a
  // branch must not rebuild the rows.
  const { rows, parentById, depthById } = useMemo(
    () => buildSessionTreeRows(data, foldedItemIds, collapsedTreeIds),
    [data, foldedItemIds, collapsedTreeIds],
  );
  const items = useMemo(() => buildSessionTreeListItems(data, rows), [data, rows]);
  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.itemId, index])),
    [rows],
  );

  const selectedId = chosenId ?? (data.isFiltered ? (rows[0]?.itemId ?? null) : null);
  const tabStopId = selectedId ?? rows[0]?.itemId ?? null;

  /** Height of a tree header; every header is the same one-line component. */
  const [headerHeightPx, setHeaderHeightPx] = useState(DEFAULT_TREE_HEADER_HEIGHT_PX);
  const offsets = useMemo(() => listItemOffsetsPx(items, headerHeightPx), [items, headerHeightPx]);
  const itemIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    items.forEach((item, index) => {
      if (item.kind === 'row') indexById.set(item.row.itemId, index);
    });
    return indexById;
  }, [items]);

  // The virtualizer hands back one mutable instance whose methods read live
  // state, so nothing derived from it may be memoised by reference. Nothing here
  // is: it is read during render and in effects only.
  // eslint-disable-next-line react-hooks/incompatible-library -- approved: TanStack Virtual's documented React usage
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    getItemKey: (index) => listItemKey(items[index]),
    // Exact for rows (their height is a constant) and a good guess for a header
    // until the first one is measured.
    estimateSize: (index) => listItemHeightPx(items[index], headerHeightPx),
    // Only headers need measuring: a row's height is known, and measuring it
    // would force a layout read for every row that scrolls in.
    measureElement: (element, entry, instance): number => {
      const height = measureElement(element, entry, instance);
      setHeaderHeightPx((previous) => (Math.abs(previous - height) < 0.5 ? previous : height));
      return height;
    },
    overscan: 8,
  });

  const litRowId = findLitRowId(rows, data.activePathIds, hoverRowId);
  const pathOwners = useMemo(
    (): Map<number, string> =>
      litRowId === null
        ? new Map<number, string>()
        : collectPathOwners(litRowId, parentById, depthById),
    [litRowId, parentById, depthById],
  );
  const railSpans = useMemo(
    () => collectRailSpans(items, offsets, pathOwners, litRowId),
    [items, offsets, pathOwners, litRowId],
  );

  const toggleFolded = useCallback((itemId: string): void => {
    setFoldedItemIds((previous) => {
      const next = new Set(previous);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (entryId: string): void => {
      setChosenId(entryId);
      onSelect(entryId);
    },
    [onSelect],
  );

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntry): void => {
      onRowPath(entry.id);
      onRowEnter(event, entry);
    },
    [onRowEnter, onRowPath],
  );

  const handleRowLeave = useCallback((): void => {
    onRowPath(null);
    onRowLeave();
  }, [onRowLeave, onRowPath]);

  useImperativeHandle(
    ref,
    () => ({
      moveSelection: (step) => {
        if (rows.length === 0) return;
        const index = selectedId === null ? -1 : (rowIndexById.get(selectedId) ?? -1);
        const nextIndex = Math.min(Math.max(index + step, 0), rows.length - 1);
        setChosenId(rows[nextIndex].itemId);
      },
      enterTargetId: () => selectedId ?? rows[0]?.itemId ?? null,
    }),
    [rows, rowIndexById, selectedId],
  );

  /**
   * The keys of a tree: up and down a row, Home and End, and right and left to
   * unfold and fold. Right and left only fold a row that has a chevron; on any
   * other row they step to the next row, or back to the row it hangs from.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (rows.length === 0) return;
    const index = tabStopId === null ? 0 : (rowIndexById.get(tabStopId) ?? 0);
    const row = rows[index];
    const item = data.getItem(row.itemId);
    const foldable = item !== undefined && canFoldRow(item.childIds.length, row.isBranchChild);
    const folded = foldedItemIds.has(row.itemId);
    let targetIndex: number | undefined;
    switch (event.key) {
      case 'ArrowDown':
        targetIndex = index + 1;
        break;
      case 'ArrowUp':
        targetIndex = index - 1;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = rows.length - 1;
        break;
      case 'ArrowRight':
        if (foldable && folded) toggleFolded(row.itemId);
        else targetIndex = index + 1;
        break;
      case 'ArrowLeft': {
        if (foldable && !folded) {
          toggleFolded(row.itemId);
          break;
        }
        const parentId = parentById.get(row.itemId);
        targetIndex = parentId === undefined ? undefined : rowIndexById.get(parentId);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    if (targetIndex === undefined) return;
    const targetId = rows[Math.min(Math.max(targetIndex, 0), rows.length - 1)].itemId;
    setChosenId(targetId);
    pendingFocusIdRef.current = targetId;
  };

  // A row the arrow keys moved to may still be outside the window: the scroll
  // below brings it in, and it takes the focus on the render that mounts it.
  useEffect(() => {
    const targetId = pendingFocusIdRef.current;
    const container = containerRef.current;
    if (targetId === null || !container) return;
    for (const element of container.querySelectorAll<HTMLElement>('[data-tree-row-id]')) {
      if (element.dataset.treeRowId !== targetId) continue;
      element.focus({ preventScroll: true });
      pendingFocusIdRef.current = null;
      return;
    }
  });

  // Open at the current position, not at the top of a long session — once. After
  // that the reader owns the scroll: a fold or a live refresh must not yank the
  // list back while they read further up.
  const currentRowIndex = currentId === null ? undefined : itemIndexById.get(currentId);
  useEffect(() => {
    if (!autoScroll || scrolledToCurrentRef.current || currentRowIndex === undefined) return;
    scrolledToCurrentRef.current = true;
    virtualizer.scrollToIndex(currentRowIndex, { align: 'center' });
  }, [autoScroll, currentRowIndex, virtualizer]);

  // Bring the row the keyboard moves to into view: the element of a row outside
  // the window does not exist, so there is nothing for the browser to scroll to.
  const selectedRowIndex = selectedId === null ? undefined : itemIndexById.get(selectedId);
  useEffect(() => {
    if (selectedId === revealedIdRef.current || selectedRowIndex === undefined) return;
    revealedIdRef.current = selectedId;
    virtualizer.scrollToIndex(selectedRowIndex, { align: 'auto' });
  }, [selectedId, selectedRowIndex, virtualizer]);

  /**
   * Scrolling moves the rows out from under the pointer, and can take the row
   * the keyboard is on out of the window with it — the focused element unmounts
   * and focus falls back to the page. Handing the container the focus in that
   * case keeps the arrow keys working; the search box keeps its own focus, since
   * the focused element is then outside the list.
   */
  const handleScroll = useCallback((): void => {
    handleRowLeave();
    const container = containerRef.current;
    if (!container || document.activeElement !== document.body) return;
    container.focus({ preventScroll: true });
  }, [handleRowLeave]);

  /**
   * The height to budget for a tree header. A session with a single tree has none
   * of them, and the band that draws the current one works in this unit too.
   */
  const treeHeaderHeightPx = data.treeIds.length > 1 ? headerHeightPx : 0;

  const rowContext: SessionTreeRowContext = {
    data,
    currentId,
    selectedId,
    tabStopId,
    foldedItemIds,
    onSelect,
    onRowClick: handleRowClick,
    onToggleFold: toggleFolded,
    onRowEnter: handleRowEnter,
    onRowLeave: handleRowLeave,
  };

  const windowTopPx = virtualizer.getVirtualItems()[0]?.start ?? 0;

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label="Session tree"
      // Focusable from script only: it takes the focus when a scroll unmounts the
      // focused row. Tab lands on a row.
      tabIndex={-1}
      className="h-full overflow-y-auto px-2 outline-none"
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      {/* The ancestor band sticks inside the list, above the rows and the tree
          headers (`z-20`), and takes no space in the flow. */}
      <PinnedAncestors
        scrollRef={containerRef}
        items={items}
        offsets={offsets}
        parentById={parentById}
        depthById={depthById}
        headerHeightPx={treeHeaderHeightPx}
        collapsedTreeIds={collapsedTreeIds}
        onToggleTree={onToggleTree}
        rowContext={rowContext}
      />
      {/* The spacer is as tall as the whole list, so the scrollbar is honest; the
          rows inside it are only the ones on screen, and the window moves with
          the scroll. */}
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
        data-testid="session-tree-virtualizer"
      >
        <div
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translateY(${windowTopPx}px)` }}
        >
          <SessionTreeRails spans={railSpans} windowTopPx={windowTopPx} />
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index];
            if (!item) return null;
            if (item.kind === 'header') {
              return (
                <div
                  key={listItemKey(item)}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                >
                  {/* Several trees in one session file: a header per tree keeps
                      them apart and tells the user how many versions there are.
                      It stays up while searching, so a match is still placed in
                      its version. */}
                  <TreeHeader
                    position={item.position}
                    isCurrent={item.treeId === data.currentRootId}
                    expanded={!collapsedTreeIds.has(item.treeId)}
                    stats={data.rootStatsById.get(item.statsItemId)}
                    isFirst={item.isFirst}
                    onToggle={() => onToggleTree(item.treeId)}
                  />
                </div>
              );
            }
            return (
              <SessionTreeRowItem
                key={listItemKey(item)}
                row={item.row}
                isLitOwner={isRailOwner(item.row, pathOwners)}
                rowContext={rowContext}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SessionTreeRowItemProps {
  row: SessionTreeFlatRow;
  /** The light turns in at this row, so its elbow is lit. */
  isLitOwner: boolean;
  rowContext: SessionTreeRowContext;
}

/**
 * One row of the list, with the spacing a fork's child carries and its elbow.
 *
 * The elbow is the one piece of a branch line that does belong to a row: it is
 * where the line meets this row's chevron, so it moves with the row and is the
 * only piece that is ever painted in the accent on a narrow run.
 */
function SessionTreeRowItem({
  row,
  isLitOwner,
  rowContext,
}: SessionTreeRowItemProps): React.JSX.Element | null {
  const { data, currentId, selectedId } = rowContext;
  const item = data.getItem(row.itemId);
  if (!item) return null;
  return (
    <div
      className="relative"
      style={{ paddingTop: row.isBranchChild ? BRANCH_SPACING_PX : 0 }}
      data-tree-branch={row.isBranchChild ? 'true' : undefined}
    >
      {row.isBranchChild && (
        <span
          className="absolute"
          aria-hidden="true"
          data-tree-elbow={isLitOwner ? 'lit' : 'quiet'}
          style={{
            // Starts one pixel to the right of the line: that pixel is the
            // corner itself, and painting it twice would darken it (the lines
            // are translucent) and, with an accented fork, mix two colours.
            left: chevronCentreX(row.depth - 1) + RAIL_WIDTH_PX,
            top: BRANCH_ELBOW_TOP_PX,
            width: BRANCH_ELBOW_WIDTH_PX - RAIL_WIDTH_PX,
            height: RAIL_WIDTH_PX,
            background: railColor(isLitOwner),
          }}
        />
      )}
      <TreeRow
        entry={item.entry}
        childCount={item.childIds.length}
        // ARIA level counts from one; the row's depth from zero.
        level={row.depth + 1}
        depth={row.depth}
        isBranchChild={row.isBranchChild}
        matchIndexes={data.matchIndexesById.get(row.itemId)}
        isCurrent={row.itemId === currentId}
        isSelected={selectedId === row.itemId && row.itemId !== currentId}
        rowContext={rowContext}
      />
    </div>
  );
}
