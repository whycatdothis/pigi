/**
 * Geometry of the session tree's rows.
 *
 * One set of numbers shared by the rows, the branch lines and the pinned band:
 * the lines are derived from the same constants the rows are, so a layout change
 * cannot silently leave them behind. Lengths are in CSS pixels.
 */

/** Indent column width: a fork indents its children by exactly this much. */
export const INDENT_PX = 20;
/** Row padding before the row's content (`pl-2`). */
export const ROW_PADDING_PX = 8;
/** Room an indent column leaves before the content (the row's `gap-2`). */
export const ROW_GAP_PX = 8;
/** Width of the fold chevron's box (`size-4`). */
export const CHEVRON_PX = 16;
/** Height of a row; the hover preview and the branch elbows measure against it. */
export const ROW_HEIGHT_PX = 32;

/**
 * Structure line width.
 *
 * A hairline: one whole pixel, so it never blurs into a grey bar and stays
 * thinner than any row chrome.
 */
export const RAIL_WIDTH_PX = 1;
/** Extra space above a fork's direct children; the line spans it. */
export const BRANCH_SPACING_PX = 2;
/**
 * Height of the last child's line: from the fork's own edge down to the middle
 * of that child's row, where its elbow takes over.
 */
export const BRANCH_LAST_RAIL_HEIGHT_PX = BRANCH_SPACING_PX + ROW_HEIGHT_PX / 2;
/** The elbow sits on the pixel above the row's centre, like the line does. */
export const BRANCH_ELBOW_TOP_PX = BRANCH_LAST_RAIL_HEIGHT_PX - RAIL_WIDTH_PX;
/**
 * From a fork's line to its child's content, corner included.
 *
 * The line leaves the fork at the centre of that row's chevron, so the elbow is
 * what is left of the indent once half a chevron is taken off — and it stops at
 * the chevron's box, never on the glyph. The corner pixel belongs to the line,
 * so the elbow element is one pixel shorter than this run.
 */
export const BRANCH_ELBOW_WIDTH_PX = INDENT_PX - CHEVRON_PX / 2 + RAIL_WIDTH_PX;

/** Neutral structure line: quieter than the row text, still readable. */
export const RAIL_COLOR = 'color-mix(in oklab, var(--foreground) 28%, transparent)';
/** Structure line on the active path, so the way back to the leaf stands out. */
export const RAIL_COLOR_CURRENT = 'color-mix(in oklab, var(--system-accent) 60%, transparent)';

/** Width of the hover preview card. */
export const CARD_WIDTH_PX = 380;
/** Distance between the card and the dialog's right edge. */
export const CARD_INSET_PX = 12;
/** Tallest the card grows before it scrolls. */
export const CARD_MAX_HEIGHT_PX = 320;
/**
 * Distance between the hovered row's top edge and the card's.
 *
 * Enough air that the row's own text stays readable while the card is up. It is
 * *inside* the transparent wrapper that owns the hover, so
 * the pointer can cross it on its way into the card without the card closing.
 */
export const CARD_GAP_PX = 20;

/** Structure line colour for a rail or an elbow. */
export function railColor(tinted: boolean): string {
  return tinted ? RAIL_COLOR_CURRENT : RAIL_COLOR;
}

/**
 * Where a row at `depth` starts drawing: the left edge of its fold chevron.
 *
 * Rows are as wide as the list, so this is measured from the row's own box —
 * the indentation is the row's padding, not a narrow gutter element.
 */
export function rowContentX(depth: number): number {
  return ROW_PADDING_PX + depth * INDENT_PX + ROW_GAP_PX;
}

/**
 * Centre of the fold chevron at `depth`.
 *
 * A fork's line hangs from the chevron of the row it starts at, so this is
 * where that column lives.
 */
export function chevronCentreX(depth: number): number {
  return rowContentX(depth) + CHEVRON_PX / 2;
}
