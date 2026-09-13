/**
 * The session tree list as a flat list of items, plus the geometry that follows.
 *
 * The rows come out of `flattenSessionTreeDisplay` in the order they draw; what
 * this adds is everything the list needs on top of that order: the tree headers
 * woven between the rows, the height of every item, where each one starts, which
 * one sits at the top of the viewport, and the branch lines. All of it is
 * arithmetic over the row order, so it holds for rows that are not rendered —
 * which is what lets the list draw a window instead of the whole session.
 */
import type { SessionTreeData, SessionTreeFlatRow } from '../../lib/sessionTreeData';
import {
  BRANCH_SPACING_PX,
  ROW_HEIGHT_PX,
  chevronCentreX,
  RAIL_WIDTH_PX,
} from './sessionTreeGeometry';

/** Height of a tree header before one has been measured. */
export const DEFAULT_TREE_HEADER_HEIGHT_PX = 28;

/** One line of the list: a version header, or a row. */
export type SessionTreeListItem =
  | {
      kind: 'header';
      treeId: string;
      position: number;
      isFirst: boolean;
      /** The row a header reads its stats from: its tree's first row, or the tree. */
      statsItemId: string;
    }
  | { kind: 'row'; treeId: string; row: SessionTreeFlatRow };

/** The header line of one tree. */
export type SessionTreeHeaderItem = Extract<SessionTreeListItem, { kind: 'header' }>;

/** The tree's header item, which the pinned band draws while the list is inside it. */
export function findTreeHeaderItem(
  items: readonly SessionTreeListItem[],
  treeId: string,
): SessionTreeHeaderItem | undefined {
  return items.find(
    (item): item is SessionTreeHeaderItem => item.kind === 'header' && item.treeId === treeId,
  );
}

/** One fork's line: where it starts, where it ends, and where the lit run ends. */
export interface SessionTreeRailSpan {
  /** The fork's first child: two forks can share a depth, so this is the identity. */
  firstChildItemId: string;
  /** Depth of the fork the line hangs from; it lives in that row's chevron column. */
  forkDepth: number;
  /** Top of the line: just above its first child's row. */
  topPx: number;
  /** Bottom of the line: the elbow of its last child, at that row's centre. */
  endPx: number;
  /** For a fork the lit path goes through: where the lit part stops. */
  litEndPx: number | null;
}

/**
 * The rows the tree shows: what the fold state adds up to.
 *
 * The rows are read from the dataset rather than from the tree instance because
 * the library builds its item list after mounting and hands it over a beat later;
 * a list that read it would draw nothing on its first render and again after
 * every remount. The rule is the tree's own: a row is shown unless the version it
 * belongs to is folded away, and its children are shown when it is open.
 */
export function collectVisibleItemIds(
  data: SessionTreeData,
  expandedItemIds: readonly string[],
  collapsedTreeIds: ReadonlySet<string>,
): Set<string> {
  const expanded = new Set(expandedItemIds);
  const visible = new Set<string>();
  const visit = (itemId: string): void => {
    for (const childId of data.getChildren(itemId)) {
      const treeId = data.treeRootIdByItemId.get(childId) ?? childId;
      if (collapsedTreeIds.has(treeId)) continue;
      visible.add(childId);
      if (expanded.has(childId)) visit(childId);
    }
  };
  visit(data.rootItemId);
  return visible;
}

/**
 * The list's items, in order.
 *
 * A filter can leave a tree without its root row, so the rows are grouped by the
 * tree they belong to rather than by position: a tree's rows stay under its own
 * header. Headers only exist when there is more than one version to tell apart.
 */
export function buildSessionTreeListItems(
  data: SessionTreeData,
  rows: readonly SessionTreeFlatRow[],
): SessionTreeListItem[] {
  const rowsByTreeId = new Map<string, SessionTreeFlatRow[]>();
  for (const row of rows) {
    const treeId = data.treeRootIdByItemId.get(row.itemId) ?? row.itemId;
    const treeRows = rowsByTreeId.get(treeId);
    if (treeRows) treeRows.push(row);
    else rowsByTreeId.set(treeId, [row]);
  }

  const items: SessionTreeListItem[] = [];
  data.treeIds.forEach((treeId, index) => {
    const treeRows = rowsByTreeId.get(treeId) ?? [];
    if (data.treeIds.length > 1) {
      items.push({
        kind: 'header',
        treeId,
        position: index + 1,
        isFirst: index === 0,
        statsItemId: treeRows[0]?.itemId ?? treeId,
      });
    }
    for (const row of treeRows) {
      items.push({ kind: 'row', treeId, row });
    }
  });
  return items;
}

/**
 * How tall one item draws.
 *
 * A row is its own height plus the spacing a fork's child carries above it — the
 * line above it spans that spacing, so it belongs to the item. Both are
 * constants, so every row's height is known before it is ever rendered. A header
 * is measured: it is text, so only the browser knows how tall it is.
 */
export function listItemHeightPx(item: SessionTreeListItem, headerHeightPx: number): number {
  if (item.kind === 'header') return headerHeightPx;
  return ROW_HEIGHT_PX + (item.row.isBranchChild ? BRANCH_SPACING_PX : 0);
}

/** Where every item starts, in scroll-content pixels. */
export function listItemOffsetsPx(
  items: readonly SessionTreeListItem[],
  headerHeightPx: number,
): number[] {
  const offsets = new Array<number>(items.length);
  let cursor = 0;
  for (let index = 0; index < items.length; index += 1) {
    offsets[index] = cursor;
    cursor += listItemHeightPx(items[index], headerHeightPx);
  }
  return offsets;
}

/** Top of a row's own box: a branch child's item starts one spacing above it. */
export function rowTopInItemPx(item: SessionTreeListItem): number {
  if (item.kind === 'header') return 0;
  return item.row.isBranchChild ? BRANCH_SPACING_PX : 0;
}

/**
 * The row the light is on.
 *
 * The row under the pointer, or — when the pointer is nowhere — the last row of
 * the active path in reading order, which is the one closest to the leaf. A
 * filter or a fold can hide the leaf itself; its path is still on screen, so the
 * deepest visible row of it carries the mark.
 */
export function findLitRowId(
  rows: readonly SessionTreeFlatRow[],
  activePathIds: ReadonlySet<string>,
  hoverRowId: string | null,
): string | null {
  if (hoverRowId !== null) return hoverRowId;
  let litId: string | null = null;
  for (const row of rows) {
    if (activePathIds.has(row.itemId)) litId = row.itemId;
  }
  return litId;
}

/**
 * The row at the top of the list: the first one that is not entirely hidden
 * behind the band of sticky headers.
 *
 * Binary search over the offsets, so it stays cheap on a long session. A header
 * can be what sits at the threshold — it is sticky, so it covers the rows above
 * the answer, not the answer.
 */
export function findTopRowIndex(
  items: readonly SessionTreeListItem[],
  offsets: readonly number[],
  scrollTopPx: number,
  headerHeightPx: number,
): number | null {
  // The first item whose bottom is below the top of the list, header heights
  // counted: the band mirrors from there. What the band itself draws (`the tree
  // header`) is over the rows, not in front of them, so it adds nothing here.
  const threshold = scrollTopPx;
  let low = 0;
  let high = items.length - 1;
  let below = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] + listItemHeightPx(items[middle], headerHeightPx) > threshold) {
      below = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  // Nothing below the band means the list is scrolled to its end: the band then
  // belongs to the last row, which is the one on screen.
  if (below < 0) return lastRowIndex(items);
  for (let index = below; index < items.length; index += 1) {
    if (items[index].kind === 'row') return index;
  }
  return lastRowIndex(items);
}

/** The last row of the list, or null when it has none. */
function lastRowIndex(items: readonly SessionTreeListItem[]): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].kind === 'row') return index;
  }
  return null;
}

/**
 * The branch lines of the rows in the list, one per fork.
 *
 * A fork's line runs from just above its first child's row down to the elbow of
 * its last child, and it is drawn as one span per fork instead of one per row:
 * the children of a fork follow each other in reading order, so the line is
 * continuous by construction, and a row deep inside a branch is simply inside
 * the fork's span.
 *
 * The lit run then needs one more number: where the light stops. That is the
 * centre of the lit row whenever the path turns into this fork — the run covers
 * the way down to the row it leads to — and null for every other fork.
 */
export function collectRailSpans(
  items: readonly SessionTreeListItem[],
  offsets: readonly number[],
  pathOwners: ReadonlyMap<number, string>,
  litRowId: string | null,
): SessionTreeRailSpan[] {
  const litIndex =
    litRowId === null
      ? -1
      : items.findIndex((item) => item.kind === 'row' && item.row.itemId === litRowId);
  const litCentrePx =
    litIndex < 0 ? null : offsets[litIndex] + rowTopInItemPx(items[litIndex]) + ROW_HEIGHT_PX / 2;

  const spans: SessionTreeRailSpan[] = [];
  /** Forks whose line is still running, keyed by the depth of the fork. */
  const open = new Map<
    number,
    {
      firstChildItemId: string;
      forkDepth: number;
      topPx: number;
      lastChildTopPx: number;
      lit: boolean;
    }
  >();

  const close = (forkDepth: number): void => {
    const fork = open.get(forkDepth);
    if (!fork) return;
    open.delete(forkDepth);
    spans.push({
      firstChildItemId: fork.firstChildItemId,
      forkDepth,
      topPx: fork.topPx,
      endPx: fork.lastChildTopPx + ROW_HEIGHT_PX / 2,
      litEndPx: fork.lit && litCentrePx !== null ? litCentrePx : null,
    });
  };

  items.forEach((item, index) => {
    if (item.kind !== 'row') return;
    const { row } = item;
    // A line lives at the depth of the fork above it, so a row at this depth or
    // higher ends every line deeper than itself.
    for (const forkDepth of [...open.keys()]) {
      if (forkDepth >= row.depth) close(forkDepth);
    }
    if (!row.isBranchChild) return;
    const forkDepth = row.depth - 1;
    const itemTopPx = offsets[index];
    const childTopPx = itemTopPx + BRANCH_SPACING_PX;
    const fork = open.get(forkDepth) ?? {
      firstChildItemId: row.itemId,
      forkDepth,
      topPx: itemTopPx,
      lastChildTopPx: childTopPx,
      lit: false,
    };
    open.set(forkDepth, fork);
    fork.lastChildTopPx = childTopPx;
    // The path turns in here: this fork's lit run reaches the lit row.
    if (litIndex >= 0 && pathOwners.get(row.depth) === row.itemId) fork.lit = true;
  });
  for (const forkDepth of [...open.keys()]) close(forkDepth);
  return spans;
}

/** Whether the light turns in at this row: the row's own elbow is lit. */
export function isRailOwner(
  row: SessionTreeFlatRow,
  pathOwners: ReadonlyMap<number, string>,
): boolean {
  return pathOwners.get(row.depth) === row.itemId;
}

/** Where a fork's line sits, in pixels from the list's left edge. */
export function railLeftPx(forkDepth: number): number {
  return chevronCentreX(forkDepth) - RAIL_WIDTH_PX;
}
