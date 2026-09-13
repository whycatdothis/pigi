import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import { hotkeysCoreFeature, syncDataLoaderFeature } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import type { ItemInstance, TreeInstance } from '@headless-tree/core';
import type { SessionTreeEntry } from '../../../../shared/ipcContract';
import {
  buildSessionTreeDisplay,
  collectPathOwners,
  flattenSessionTreeDisplay,
  type SessionTreeData,
  type SessionTreeFlatRow,
  type SessionTreeItem,
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
  collectVisibleItemIds,
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

interface SessionTreeListProps {
  data: SessionTreeData;
  currentId: string | null;
  /** Only the first dataset of a visit scrolls; a live refresh must not. */
  autoScroll: boolean;
  treeRef: React.RefObject<TreeInstance<SessionTreeItem> | null>;
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

/** The slice of the tree's state this list owns: the rows that are open, and the row the keyboard is on. */
interface SessionTreeSelectionState {
  expandedItems: string[];
  focusedItem: string | null;
}

/**
 * Read one state slot.
 *
 * The library types every slot as `Updater<...>` because a setter may be handed an
 * updater function; what it stores, and what arrives here, is the value itself.
 */
function readStateSlot<T>(slot: T | ((previous: T) => T) | undefined, fallback: T): T {
  return typeof slot === 'function' ? fallback : (slot ?? fallback);
}

/** A row's key in the virtualizer: stable across a resize of the window. */
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
  data,
  currentId,
  autoScroll,
  treeRef,
  collapsedTreeIds,
  onToggleTree,
  hoverRowId,
  onSelect,
  onRowEnter,
  onRowLeave,
  onRowPath,
}: SessionTreeListProps): React.JSX.Element {
  // The tree's own state (what is expanded, which row the keyboard is on) is held as
  // React state here, which is the adapter contract: the library reports every change
  // through the setters named in `stateHandlerNames`, and hands the whole object back
  // when it rebuilds. Owning it is what makes a re-render safe — the library merges
  // the state it is given over the one it holds, so a value it changed without a
  // rebuild (the focused row) would otherwise be rolled back by the next render.
  const [treeState, setTreeState] = useState<SessionTreeSelectionState>(() => ({
    expandedItems: expandedItemIds(data),
    focusedItem: null,
  }));

  const tree = useTree<SessionTreeItem>({
    rootItemId: data.rootItemId,
    getItemName: (item) => item.getItemData().entry?.preview ?? '',
    isItemFolder: (item) => item.getItemData().childIds.length > 0,
    dataLoader: {
      getItem: (itemId) => data.getItem(itemId),
      getChildren: (itemId) => data.getChildren(itemId),
    },
    // Unfold everything except the trees the user is not in: with several
    // versions in one file, one long tree would otherwise push the others out
    // of sight. Their headers stay, so none of them can be missed.
    initialState: { expandedItems: expandedItemIds(data) },
    state: treeState,
    setState: (next) =>
      setTreeState((previous) => {
        const state = typeof next === 'function' ? next(previous) : next;
        return {
          expandedItems: readStateSlot(state.expandedItems, previous.expandedItems),
          focusedItem: readStateSlot(state.focusedItem, previous.focusedItem),
        };
      }),
    setFocusedItem: (next) =>
      setTreeState((previous) => ({
        ...previous,
        focusedItem: readStateSlot(next, previous.focusedItem),
      })),
    setExpandedItems: (next) =>
      setTreeState((previous) => ({
        ...previous,
        expandedItems: readStateSlot(next, previous.expandedItems),
      })),
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
    onPrimaryAction: (item) => {
      const entry = item.getItemData().entry;
      if (entry) onSelect(entry.id);
    },
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  // `getContainerProps` hands the library its own `ref` (registerElement), which
  // is what routes the container's keydown into the tree's hotkeys. Spreading it
  // and then writing `ref` would drop that registration, so the element goes to
  // both owners.
  //
  // The callback must not depend on the tree instance: React re-attaches a ref
  // callback whose identity changed, and calls the previous one with null. That
  // would leave `containerRef` empty for a beat after every fold, and the
  // virtualizer reads that ref for its scroll element — it would detach itself
  // from the list and stop following the scroll.
  const currentTreeRef = useRef(tree);
  useEffect(() => {
    currentTreeRef.current = tree;
    tree.registerElement(containerRef.current);
  }, [tree]);
  const setContainer = useCallback((element: HTMLDivElement | null): void => {
    containerRef.current = element;
    currentTreeRef.current.registerElement(element);
  }, []);

  // The rows the tree currently shows (folds and filters applied). This is the
  // expensive part — one walk of the visible session — so it is memoised on the
  // things that can change it, and not on the row the light is on: a pointer
  // moving along a branch must not rebuild the tree.
  const visibleItemIds = useMemo(
    () => collectVisibleItemIds(data, treeState.expandedItems, collapsedTreeIds),
    [data, treeState.expandedItems, collapsedTreeIds],
  );

  const display = useMemo(
    () => buildSessionTreeDisplay(data, visibleItemIds),
    [data, visibleItemIds],
  );
  const rows = useMemo(() => flattenSessionTreeDisplay(display), [display]);
  const items = useMemo(() => buildSessionTreeListItems(data, rows), [data, rows]);

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
        : collectPathOwners(litRowId, display.parentById, display.depthById),
    [litRowId, display],
  );
  const railSpans = useMemo(
    () => collectRailSpans(items, offsets, pathOwners, litRowId),
    [items, offsets, pathOwners, litRowId],
  );

  /** Fold or unfold one row. */
  const toggleFolded = useCallback((target: ItemInstance<SessionTreeItem>): void => {
    if (target.isExpanded()) {
      target.collapse();
    } else {
      target.expand();
    }
  }, []);

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntry): void => {
      onRowPath(entry.id);
      onRowEnter(event, entry);
    },
    [onRowEnter, onRowPath],
  );

  // The dialog folds the trees the session is not in, and the display leaves their
  // rows out. The tree itself has to agree: with those rows still in its item list,
  // Home, End and the arrow keys at a tree's edge would move the cursor onto a row
  // that is not on screen.
  useEffect(() => {
    for (const treeId of data.treeIds) {
      const item = tree.getItemInstance(treeId);
      const wanted = !collapsedTreeIds.has(treeId);
      if (wanted !== item.isExpanded()) {
        if (wanted) item.expand();
        else item.collapse();
      }
    }
  }, [tree, data.treeIds, collapsedTreeIds]);

  const handleRowLeave = useCallback((): void => {
    onRowPath(null);
    onRowLeave();
  }, [onRowLeave, onRowPath]);

  useEffect(() => {
    treeRef.current = tree;
    return () => {
      if (treeRef.current === tree) treeRef.current = null;
    };
  }, [tree, treeRef]);

  // Open at the current position, not at the top of a long session. A live
  // refresh must not yank the list: the user may be reading further up.
  //
  // The row index is a dependency because the tree hands its items over a beat
  // after the first render: on that first pass there is no row to scroll to yet,
  // and nothing else in this effect would change to bring it back.
  const currentRowIndex = currentId === null ? undefined : itemIndexById.get(currentId);
  useEffect(() => {
    if (!autoScroll || currentRowIndex === undefined) return;
    virtualizer.scrollToIndex(currentRowIndex, { align: 'center' });
  }, [autoScroll, currentRowIndex, virtualizer]);

  // Keep the row the keyboard is on in view. The library's own hotkeys move the
  // focus and leave the scrolling to us: the element of a row outside the window
  // does not exist, so there is nothing for the browser to scroll to.
  const focusedRowIndex =
    treeState.focusedItem === null ? undefined : itemIndexById.get(treeState.focusedItem);
  useEffect(() => {
    if (focusedRowIndex === undefined) return;
    virtualizer.scrollToIndex(focusedRowIndex, { align: 'auto' });
  }, [focusedRowIndex, virtualizer]);

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
    tree,
    currentId,
    selectedId: treeState.focusedItem,
    onSelect,
    onToggleFold: toggleFolded,
    onRowEnter: handleRowEnter,
    onRowLeave: handleRowLeave,
  };

  const windowTopPx = virtualizer.getVirtualItems()[0]?.start ?? 0;

  return (
    <div
      {...tree.getContainerProps('Session tree')}
      ref={setContainer}
      className="h-full overflow-y-auto px-2 outline-none"
      onScroll={handleScroll}
    >
      {/* The ancestor band sticks inside the list, above the rows and the tree
          headers (`z-20`), and takes no space in the flow. */}
      <PinnedAncestors
        scrollRef={containerRef}
        items={items}
        offsets={offsets}
        parentById={display.parentById}
        depthById={display.depthById}
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
  const { data, tree, currentId, selectedId } = rowContext;
  const item = tree.getItemInstance(row.itemId);
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
        item={item}
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

/**
 * Every row starts unfolded.
 *
 * Versions fold as a whole (`collapsedTreeIds` in the dialog): folding a tree
 * through the row items would leave its rows in the DOM, and a fold that hides
 * some of a tree's roots but not the others has no meaning.
 */
function expandedItemIds(data: SessionTreeData): string[] {
  return data.allItemIds;
}
