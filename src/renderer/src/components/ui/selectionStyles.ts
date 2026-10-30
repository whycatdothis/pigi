/**
 * Shared checked and hover styling for a discrete choice row. The accent
 * carries the checked state: tinted background, accent label, accent icons.
 * Font size and height live with each role, so a short mode menu and a
 * searchable list share the state without sharing the scale.
 *
 * Radix sets `data-state` on radio items; the thinking flyout sets it by hand
 * so it can share the row without a second set of classes.
 */
export const ACCENT_SELECTION_ROW_CLASS =
  "flex cursor-default items-center gap-1 rounded-control pl-2 pr-2 text-left outline-hidden select-none transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[state=checked]:bg-accent-subtle data-[state=checked]:text-[var(--system-accent)] data-[state=checked]:hover:bg-accent-subtle data-[state=checked]:hover:text-[var(--system-accent)] data-[state=checked]:focus:bg-accent-subtle data-[state=checked]:focus:text-[var(--system-accent)] data-[state=checked]:focus:**:text-[var(--system-accent)]";

/** Caption row for short mode menus (28px). */
export const COMPACT_SELECTION_ITEM_CLASS = `${ACCENT_SELECTION_ROW_CLASS} py-1 text-caption`;
