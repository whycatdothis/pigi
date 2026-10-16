/**
 * Geometry of the session tree's rows.
 *
 * The constants and the two position helpers are **the app's own file**, imported
 * rather than copied:
 *
 *   src/renderer/src/components/sessionTree/sessionTreeGeometry.ts
 *
 * It has no imports of its own, so it compiles here as-is — which is the point.
 * Change `ROW_HEIGHT_PX` there and the tree on this page is a different tree on
 * the next build; there is no copy to forget.
 *
 * What is left in this file is the arithmetic the app keeps in a second module
 * (`sessionTreeListModel.ts`) because it works over the app's row items: the row
 * offsets, the branch spans and the light run. That module wants the app's
 * `SessionTreeFlatRow` and a measured header height, neither of which exists in a
 * still — the list here is short enough to measure in one pass. So the algorithm
 * is the same and the numbers are shared; only the input shape differs.
 */

export {
  BRANCH_ELBOW_TOP_PX,
  BRANCH_ELBOW_WIDTH_PX,
  BRANCH_SPACING_PX,
  CHEVRON_PX,
  INDENT_PX,
  RAIL_COLOR,
  RAIL_COLOR_CURRENT,
  RAIL_WIDTH_PX,
  ROW_GAP_PX,
  ROW_HEIGHT_PX,
  ROW_PADDING_PX,
  chevronCentreX,
  rowContentX,
} from '../../../src/renderer/src/components/sessionTree/sessionTreeGeometry';

import {
  BRANCH_SPACING_PX,
  RAIL_WIDTH_PX,
  ROW_HEIGHT_PX,
  chevronCentreX,
} from '../../../src/renderer/src/components/sessionTree/sessionTreeGeometry';

/**
 * The class on a rail span.
 *
 * The lines are rebuilt whenever the pointer moves to a different row, so the
 * class has to be written in the script as well as in the markup — it lives here
 * so the two cannot disagree.
 */
export const RAIL_SPAN_CLASS = 'absolute';

/** One row of the list, with the two facts the geometry needs about it. */
export interface TreeRowShape {
  depth: number;
  /** True when this row is a child of a fork, i.e. one of several alternatives. */
  isBranchChild: boolean;
}

/** One fork's line: where it starts, ends, and where the lit run stops. */
export interface TreeRailSpan {
  /** Identity of the fork's first child; two forks can share a depth. */
  key: string;
  forkDepth: number;
  topPx: number;
  endPx: number;
  /** Null when the active path does not turn into this fork. */
  litEndPx: number | null;
}

/** Where a fork's line sits, in pixels from the list's left edge. */
export function railLeftPx(forkDepth: number): number {
  return chevronCentreX(forkDepth) - RAIL_WIDTH_PX;
}

/** Where every row starts, in the list's own coordinates. */
export function rowOffsetsPx(rows: readonly TreeRowShape[]): number[] {
  const offsets = new Array<number>(rows.length);
  let cursor = 0;
  for (let index = 0; index < rows.length; index += 1) {
    offsets[index] = cursor;
    cursor += ROW_HEIGHT_PX + (rows[index].isBranchChild ? BRANCH_SPACING_PX : 0);
  }
  return offsets;
}

/** Top of a row's own box: a branch child's item starts one spacing above it. */
export function rowTopInItemPx(row: TreeRowShape): number {
  return row.isBranchChild ? BRANCH_SPACING_PX : 0;
}

/** The centre of a row, which is where its branching line ends. */
export function rowCentrePx(rows: readonly TreeRowShape[], index: number): number {
  return rowOffsetsPx(rows)[index] + rowTopInItemPx(rows[index]) + ROW_HEIGHT_PX / 2;
}

/**
 * The branch lines, one per fork.
 *
 * A line belongs to a fork, not to a row: it runs from just above the fork's
 * first child down to the elbow of its last child, so a row deep inside a branch
 * is simply inside the fork's span. This is the app's `collectRailSpans` with the
 * tree-header arithmetic taken out — the list here is short enough to measure in
 * one pass and never needs a window.
 *
 * `pathOwnerIds` answers "which row at this depth is on the active path", which
 * is what decides where the light stops.
 */
export function collectRailSpans(
  rows: readonly TreeRowShape[],
  rowIds: readonly string[],
  pathOwnerIds: ReadonlyMap<number, string>,
  litRowId: string | null,
): TreeRailSpan[] {
  const offsets = rowOffsetsPx(rows);
  const litIndex = litRowId === null ? -1 : rowIds.indexOf(litRowId);
  const litCentrePx =
    litIndex < 0 ? null : offsets[litIndex] + rowTopInItemPx(rows[litIndex]) + ROW_HEIGHT_PX / 2;

  const spans: TreeRailSpan[] = [];
  /** Forks whose line is still running, keyed by the depth of the fork. */
  const open = new Map<
    number,
    { key: string; forkDepth: number; topPx: number; lastChildTopPx: number; lit: boolean }
  >();

  const close = (forkDepth: number): void => {
    const fork = open.get(forkDepth);
    if (!fork) return;
    open.delete(forkDepth);
    spans.push({
      key: fork.key,
      forkDepth,
      topPx: fork.topPx,
      endPx: fork.lastChildTopPx + ROW_HEIGHT_PX / 2,
      litEndPx: fork.lit && litCentrePx !== null ? litCentrePx : null,
    });
  };

  rows.forEach((row, index) => {
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
      key: rowIds[index],
      forkDepth,
      topPx: itemTopPx,
      lastChildTopPx: childTopPx,
      lit: false,
    };
    open.set(forkDepth, fork);
    fork.lastChildTopPx = childTopPx;
    // The path turns in here: this fork's lit run reaches the lit row.
    if (pathOwnerIds.get(row.depth) === rowIds[index]) fork.lit = true;
  });
  for (const forkDepth of [...open.keys()]) close(forkDepth);
  return spans;
}

/** Whether the path turns in at this row, so its own elbow is lit. */
export function isRailOwner(
  row: TreeRowShape,
  rowId: string,
  pathOwnerIds: ReadonlyMap<number, string>,
): boolean {
  return pathOwnerIds.get(row.depth) === rowId;
}
