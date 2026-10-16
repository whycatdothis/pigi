/**
 * Geometry of the session tree's rows.
 *
 * Ported verbatim from the app
 * (src/renderer/src/components/sessionTree/sessionTreeGeometry.ts) so the tree
 * drawn on this page is measured, not eyeballed: the rows, the branch lines and
 * the elbows all come out of these five numbers, in the app and here.
 *
 * Lengths are in CSS pixels.
 */

/** Indent column width: a fork indents its children by exactly this much. */
export const INDENT_PX = 20;
/** Row padding before the row's content (`pl-2`). */
export const ROW_PADDING_PX = 8;
/** Room an indent column leaves before the content (the row's `gap-2`). */
export const ROW_GAP_PX = 8;
/** Width of the fold chevron's box (`size-4`). */
export const CHEVRON_PX = 16;
/** Height of a row. */
export const ROW_HEIGHT_PX = 32;
/** Structure line width. A hairline, so it never blurs into a grey bar. */
export const RAIL_WIDTH_PX = 1;
/** Extra space above a fork's direct children; the line spans it. */
export const BRANCH_SPACING_PX = 2;
/** From a fork's line to its child's content, corner included. */
export const BRANCH_ELBOW_WIDTH_PX = INDENT_PX - CHEVRON_PX / 2 + RAIL_WIDTH_PX;
/** The elbow sits on the pixel above the row's centre, like the line does. */
export const BRANCH_ELBOW_TOP_PX = BRANCH_SPACING_PX + ROW_HEIGHT_PX / 2 - RAIL_WIDTH_PX;

/** Neutral structure line: quieter than the row text, still readable. */
export const RAIL_COLOR = 'color-mix(in oklab, var(--foreground) 28%, transparent)';
/** Structure line on the active path, so the way back to the leaf stands out. */
export const RAIL_COLOR_ACTIVE = 'color-mix(in oklab, var(--system-accent) 60%, transparent)';

/** Where a row at `depth` starts drawing: the left edge of its fold chevron. */
export function rowContentX(depth: number): number {
  return ROW_PADDING_PX + depth * INDENT_PX + ROW_GAP_PX;
}

/** Centre of the fold chevron at `depth`; a fork's line hangs from here. */
export function chevronCentreX(depth: number): number {
  return rowContentX(depth) + CHEVRON_PX / 2;
}

/** Where a fork's line sits, in pixels from the list's left edge. */
export function railLeftPx(forkDepth: number): number {
  return chevronCentreX(forkDepth) - RAIL_WIDTH_PX;
}

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
