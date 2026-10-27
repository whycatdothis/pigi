import type { RenderItem } from './readGrouping';

/**
 * Trailing space a transcript row needs between itself and the next row.
 *
 * A row that ends a reply keeps a hover action band, and the band plus the base
 * row gap already separates it from the next turn, so it asks for nothing more.
 * Rows in the middle of a reply have no band: they get the block rhythm, and a
 * row that touches a tool card gets the wider edge rhythm so that a run of tool
 * calls reads as one group instead of as separate paragraphs.
 */
export type RowSpace = 'block' | 'edge';

function isUserItem(item: RenderItem | undefined): boolean {
  return item?.type === 'node' && item.node.role === 'user';
}

/** Cards are the surfaces that need breathing room around them. */
function isCardItem(item: RenderItem | undefined): boolean {
  if (!item) return false;
  return item.type === 'readGroup' || item.node.role === 'tool';
}

/** Returns undefined for rows whose spacing comes from their action band. */
export function rowSpaceFor(
  current: RenderItem,
  next: RenderItem | undefined,
): RowSpace | undefined {
  if (!next) return undefined;
  if (isUserItem(current) || isUserItem(next)) return undefined;
  return isCardItem(current) === isCardItem(next) ? 'block' : 'edge';
}

/** The next row that belongs to a reply; system notices never end one. */
export function nextReplyItem(items: RenderItem[], index: number): RenderItem | undefined {
  for (let next = index + 1; next < items.length; next += 1) {
    const item = items[next];
    if (item.type === 'node' && item.node.role === 'system') continue;
    return item;
  }
  return undefined;
}

/** Reply actions render on the final row of a reply, never in the middle. */
export function rowShowsActions(next: RenderItem | undefined): boolean {
  return !next || isUserItem(next);
}
