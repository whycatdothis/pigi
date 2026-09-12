import React, { useCallback, useEffect, useRef } from 'react';
import { hotkeysCoreFeature, syncDataLoaderFeature } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import type { ItemInstance, TreeInstance } from '@headless-tree/core';
import type { SessionTreeEntryDto } from '../../../../shared/ipcContract';
import {
  buildSessionTreeDisplay,
  type SessionTreeData,
  type SessionTreeDisplayNode,
  type SessionTreeItem,
  type SessionTreeRailTint,
} from '../../lib/sessionTreeData';
import {
  BRANCH_ELBOW_TOP_PX,
  BRANCH_ELBOW_WIDTH_PX,
  BRANCH_LAST_RAIL_HEIGHT_PX,
  BRANCH_SPACING_PX,
  RAIL_WIDTH_PX,
  chevronCentreX,
  railColor,
} from './sessionTreeGeometry';
import { TreeHeader } from './SessionTreeHeader';
import { PinnedAncestors } from './SessionTreePinnedBand';
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
  onRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto) => void;
  onRowLeave: () => void;
  /** The hovered row, or null when the pointer left the rows. */
  onRowPath: (rowId: string | null) => void;
}

/** The scrolling list: the tree, its version headers and the pinned ancestors. */
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
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
    onPrimaryAction: (item) => {
      const entry = item.getItemData().entry;
      if (entry) onSelect(entry.id);
    },
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  // The rows the tree currently shows (folds and filters applied), and how they
  // nest: the recursion below renders exactly this, so both stay in step.
  const visibleItemIds = tree
    .getItems()
    .map((item) => item.getId())
    .filter((itemId) => !collapsedTreeIds.has(data.treeRootIdByItemId.get(itemId) ?? itemId));
  const display = buildSessionTreeDisplay(data, new Set(visibleItemIds), hoverRowId);

  // One group per tree, in session order, so the header of a folded tree stays
  // on screen while its rows do not. A filter can leave several roots for one
  // tree (its root row dropped, rows re-attaching higher up): grouping by tree
  // rather than by position in the list keeps those rows under one header.
  const nodesByTreeId = new Map<string, SessionTreeDisplayNode[]>();
  for (const node of display.nodes) {
    const treeId = data.treeRootIdByItemId.get(node.itemId) ?? node.itemId;
    const nodes = nodesByTreeId.get(treeId);
    if (nodes) nodes.push(node);
    else nodesByTreeId.set(treeId, [node]);
  }
  const treeGroups = data.treeIds.map((treeId, index) => ({
    treeId,
    position: index + 1,
    nodes: nodesByTreeId.get(treeId) ?? [],
  }));

  /** Fold or unfold one row. */
  const toggleFolded = useCallback((target: ItemInstance<SessionTreeItem>) => {
    if (target.isExpanded()) {
      target.collapse();
    } else {
      target.expand();
    }
  }, []);

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto): void => {
      onRowPath(entry.id);
      onRowEnter(event, entry);
    },
    [onRowEnter, onRowPath],
  );

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
  useEffect(() => {
    if (!autoScroll || !currentId) return;
    tree.getItemInstance(currentId).getElement()?.scrollIntoView({ block: 'center' });
  }, [autoScroll, currentId, tree]);

  const rowContext: SessionTreeRowContext = {
    data,
    tree,
    currentId,
    onSelect,
    onToggleFold: toggleFolded,
    onRowEnter: handleRowEnter,
    onRowLeave: handleRowLeave,
  };

  return (
    <div
      {...tree.getContainerProps('Session tree')}
      ref={containerRef}
      className="h-full overflow-y-auto px-2 outline-none"
      // Scrolling moves the rows out from under the pointer.
      onScroll={handleRowLeave}
    >
      {/* The ancestor band sticks inside the list, above the rows and the tree
          headers (`z-20`), and takes no space in the flow. */}
      <PinnedAncestors
        containerRef={containerRef}
        parentById={display.parentById}
        depthById={display.depthById}
        visibleRowCount={display.nodes.length > 0 ? tree.getItems().length : 0}
        rowContext={rowContext}
      />
      {treeGroups.map((group, groupIndex) => (
        <React.Fragment key={group.treeId}>
          {/* Several trees in one session file: a header per tree keeps them
              apart and tells the user how many versions there are. It stays up
              while searching, so a match is still placed in its version. */}
          {data.treeIds.length > 1 && (
            <TreeHeader
              position={group.position}
              isCurrent={group.treeId === data.currentRootId}
              expanded={!collapsedTreeIds.has(group.treeId)}
              stats={data.rootStatsById.get(group.nodes[0]?.itemId ?? group.treeId)}
              isFirst={groupIndex === 0}
              onToggle={() => onToggleTree(group.treeId)}
            />
          )}
          {group.nodes.map((node) => (
            <SessionTreeDisplayRow
              key={node.itemId}
              node={node}
              level={1}
              isBranchChild={false}
              rowContext={rowContext}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

interface SessionTreeDisplayRowProps {
  node: SessionTreeDisplayNode;
  /** Nesting level of this row; the roots start at 1 (ARIA's first level). */
  level: number;
  isBranchChild: boolean;
  rowContext: SessionTreeRowContext;
}

/**
 * One row, plus everything that hangs under it.
 *
 * A lone child continues at the same level, so it renders right here as a
 * sibling; a fork hands each child to a `TreeBranch`, which owns the line the
 * child hangs from. Neither branch nor continuation adds a wrapper, so a long
 * conversation stays a flat list in the DOM.
 */
function SessionTreeDisplayRow({
  node,
  level,
  isBranchChild,
  rowContext,
}: SessionTreeDisplayRowProps): React.JSX.Element {
  const { data, tree, currentId } = rowContext;
  const item = tree.getItemInstance(node.itemId);
  const depth = level - 1;
  const branch = node.branch;

  return (
    <>
      <TreeRow
        item={item}
        level={level}
        depth={depth}
        isBranchChild={isBranchChild}
        matchIndexes={data.matchIndexesById.get(node.itemId)}
        isCurrent={node.itemId === currentId}
        rowContext={rowContext}
      />
      {node.continuation && (
        <SessionTreeDisplayRow
          node={node.continuation}
          level={level}
          isBranchChild={false}
          rowContext={rowContext}
        />
      )}
      {branch?.map((childNode, index) => (
        <TreeBranch
          key={childNode.itemId}
          forkDepth={depth}
          isLast={index === branch.length - 1}
          railTint={childNode.railTint}
          elbowTinted={childNode.elbowTint}
        >
          <SessionTreeDisplayRow
            node={childNode}
            level={level + 1}
            isBranchChild
            rowContext={rowContext}
          />
        </TreeBranch>
      ))}
    </>
  );
}

interface TreeBranchProps {
  /** Depth of the row the branch starts at; its chevron column carries the line. */
  forkDepth: number;
  /**
   * The last child: its line stops at the middle of its own row, so the fork
   * ends where the branch visibly ends instead of running on into the subtree.
   */
  isLast: boolean;
  /** How much of this child's line is the lit path (see the display builder). */
  railTint: SessionTreeRailTint;
  /** The path turns into this child here. */
  elbowTinted: boolean;
  children: React.ReactNode;
}

/**
 * One child of a fork, and the line it hangs from.
 *
 * The wrapper spans the child's whole subtree, which is what makes the line
 * continuous: siblings sit next to each other, so their lines join without a
 * seam, and no row has to know where the fork above it started.
 */
function TreeBranch({
  forkDepth,
  isLast,
  railTint,
  elbowTinted,
  children,
}: TreeBranchProps): React.JSX.Element {
  // The pixel just left of the chevron's centre, so the hairline stays whole.
  const lineLeft = chevronCentreX(forkDepth) - RAIL_WIDTH_PX;

  return (
    // The spacing sits on the wrapper rather than on the row, so the line above
    // reaches down to the fork's edge and the siblings stay joined.
    <div className="relative" style={{ paddingTop: BRANCH_SPACING_PX }} data-tree-branch="true">
      {/*
        The line is two pieces: the run from the fork's edge down to the turn
        into this child, and the run below it, which carries the fork on to the
        next sibling. A path that turns in here lights the first; a path that
        passes by on its way to a later sibling lights both. The last child has
        no second piece: its line stops at its own centre.
      */}
      <span
        className="absolute"
        aria-hidden="true"
        style={{
          left: lineLeft,
          top: 0,
          width: RAIL_WIDTH_PX,
          height: BRANCH_LAST_RAIL_HEIGHT_PX,
          background: railColor(railTint !== 'none'),
        }}
      />
      {!isLast && (
        <span
          className="absolute"
          aria-hidden="true"
          style={{
            left: lineLeft,
            top: BRANCH_LAST_RAIL_HEIGHT_PX,
            width: RAIL_WIDTH_PX,
            bottom: 0,
            background: railColor(railTint === 'full'),
          }}
        />
      )}
      <span
        className="absolute"
        aria-hidden="true"
        style={{
          // Starts one pixel to the right of the line: that pixel is the corner
          // itself, and painting it twice would darken it (the lines are
          // translucent) and, with an accented fork, mix two different colours.
          left: lineLeft + RAIL_WIDTH_PX,
          top: BRANCH_ELBOW_TOP_PX,
          width: BRANCH_ELBOW_WIDTH_PX - RAIL_WIDTH_PX,
          height: RAIL_WIDTH_PX,
          background: railColor(elbowTinted),
        }}
      />
      {children}
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
