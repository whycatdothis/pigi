import type { RenderItem } from './readGrouping';

/**
 * Trailing space a transcript row needs between itself and the next row.
 *
 * A row that ends a reply keeps a hover action band, and the band plus the base
 * row gap already separates it from the next turn, so it asks for nothing more.
 * Rows in the middle of a reply follow one ladder: prose against prose is the
 * tightest step, a tool card widens it, two cards in a row widen it again, and
 * a thinking card against a tool card gets the widest step of all, because
 * reasoning and tool work read as different groups of the same reply.
 */
export type RowSpace = 'block' | 'edge' | 'pair' | 'group';

/** What a row looks like at the edge that faces a neighbour. */
type RowKind = 'prose' | 'card' | 'thinking';

function isUserItem(item: RenderItem | undefined): boolean {
  return item?.type === 'node' && item.node.role === 'user';
}

/** Tool cards and read groups are one kind of thing: a bordered surface. */
function isCardItem(item: RenderItem): boolean {
  return item.type === 'readGroup' || item.node.role === 'tool';
}

function hasThinkingCard(item: RenderItem): boolean {
  if (item.type !== 'node') return false;
  const node = item.node;
  return node.role === 'assistant' && node.thinking.length > 0;
}

function hasProse(item: RenderItem): boolean {
  if (item.type !== 'node') return false;
  const node = item.node;
  return node.role === 'assistant' && (node.text.length > 0 || Boolean(node.errorMessage));
}

/**
 * A row can start with one kind and end with another: a streaming reply opens
 * with its thinking card and continues into prose, so the gap above it belongs
 * to the thinking step while the gap below it belongs to the prose step.
 */
function leadingKind(item: RenderItem): RowKind {
  if (isCardItem(item)) return 'card';
  return hasThinkingCard(item) ? 'thinking' : 'prose';
}

function trailingKind(item: RenderItem): RowKind {
  if (isCardItem(item)) return 'card';
  if (hasProse(item)) return 'prose';
  return hasThinkingCard(item) ? 'thinking' : 'prose';
}

function spaceBetween(current: RowKind, next: RowKind): RowSpace {
  if (current === 'thinking' || next === 'thinking') {
    const other = current === 'thinking' ? next : current;
    return other === 'card' ? 'group' : 'pair';
  }
  if (current === 'card' && next === 'card') return 'pair';
  return current === next ? 'block' : 'edge';
}

export function rowSpaceFor(
  current: RenderItem,
  next: RenderItem | undefined,
  currentHasActionBand: boolean,
): RowSpace | undefined {
  if (!next || isUserItem(next)) {
    // The action band supplies the turn boundary; a row that cannot render one
    // still needs its gutters, or the turn would collapse to the base row gap.
    return currentHasActionBand ? undefined : 'edge';
  }
  if (isUserItem(current)) return undefined;
  return spaceBetween(trailingKind(current), leadingKind(next));
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
