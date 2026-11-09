// Same algorithm as the app's sessionTreeListModel.ts, over a simpler row shape.

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

// Shared by the markup and the script that rebuilds rails on hover.
export const RAIL_SPAN_CLASS = 'absolute';

export interface TreeRowShape {
  depth: number;
  isBranchChild: boolean;
}

export interface TreeRailSpan {
  // The fork's first child id: two forks can share a depth.
  key: string;
  forkDepth: number;
  topPx: number;
  endPx: number;
  // Null when the active path does not turn into this fork.
  litEndPx: number | null;
}

export function railLeftPx(forkDepth: number): number {
  return chevronCentreX(forkDepth) - RAIL_WIDTH_PX;
}

export function rowOffsetsPx(rows: readonly TreeRowShape[]): number[] {
  const offsets = new Array<number>(rows.length);
  let cursor = 0;
  for (let index = 0; index < rows.length; index += 1) {
    offsets[index] = cursor;
    cursor += ROW_HEIGHT_PX + (rows[index].isBranchChild ? BRANCH_SPACING_PX : 0);
  }
  return offsets;
}

export function rowTopInItemPx(row: TreeRowShape): number {
  return row.isBranchChild ? BRANCH_SPACING_PX : 0;
}

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
    if (pathOwnerIds.get(row.depth) === rowIds[index]) fork.lit = true;
  });
  for (const forkDepth of [...open.keys()]) close(forkDepth);
  return spans;
}

export function isRailOwner(
  row: TreeRowShape,
  rowId: string,
  pathOwnerIds: ReadonlyMap<number, string>,
): boolean {
  return pathOwnerIds.get(row.depth) === rowId;
}
