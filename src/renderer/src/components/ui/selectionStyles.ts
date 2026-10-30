/**
 * Compact row for a discrete choice inside a popup. One step below body text,
 * with the accent carrying the checked state. The caller renders the check
 * after the label, so a short menu stays as wide as its text.
 *
 * Radix sets `data-state` on radio items; the thinking flyout sets it by hand
 * so it can share the row without a second set of classes.
 */
export const COMPACT_SELECTION_ITEM_CLASS =
  "flex cursor-default items-center gap-1 rounded-control py-1 pl-2 pr-2 text-left text-caption outline-hidden select-none transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[state=checked]:bg-accent-subtle data-[state=checked]:text-[var(--system-accent)] data-[state=checked]:hover:bg-accent-subtle data-[state=checked]:hover:text-[var(--system-accent)] data-[state=checked]:focus:bg-accent-subtle data-[state=checked]:focus:text-[var(--system-accent)] data-[state=checked]:focus:**:text-[var(--system-accent)]";
