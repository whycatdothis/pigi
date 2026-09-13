/**
 * Tests for the list model: the items the list renders, where they start, which
 * row sits at the top of the viewport, and the branch lines.
 *
 * All of it is arithmetic over the row order, which is the point: the list draws
 * a window, so the geometry of rows that are not rendered has to be right
 * anyway. The expectations here are the numbers the drawn app has: a row is 32px
 * tall, a fork's child carries 2px of spacing above it, and a lit run reaches
 * the centre of the row it leads to.
 */
import { describe, expect, it } from 'vitest';
import type { SessionTree, SessionTreeEntry } from '../../../../shared/ipcContract';
import {
  buildSessionTreeDisplay,
  collectPathOwners,
  createSessionTreeData,
  flattenSessionTreeDisplay,
  type SessionTreeDisplay,
  type SessionTreeFlatRow,
} from '../../lib/sessionTreeData';
import { BRANCH_SPACING_PX, ROW_HEIGHT_PX, rowContentX } from './sessionTreeGeometry';
import {
  buildSessionTreeListItems,
  collectRailSpans,
  collectVisibleItemIds,
  findLitRowId,
  findTopRowIndex,
  isRailOwner,
  listItemHeightPx,
  listItemOffsetsPx,
  railLeftPx,
  type SessionTreeListItem,
} from './sessionTreeListModel';

function entry(
  id: string,
  parentId: string | null,
  kind: SessionTreeEntry['kind'] = 'assistant',
): SessionTreeEntry {
  return { id, parentId, timestamp: 1_767_000_000_000, kind, preview: id };
}

function tree(entries: SessionTreeEntry[], leafId: string | null): SessionTree {
  return { entries, leafId };
}

/**
 * A chain with one fork in the middle:
 *
 *   h1 ─ a1 ─ b1 ─┬─ c1 ─ d1
 *                 └─ e1
 */
function forkTree(leafId = 'd1'): SessionTree {
  return tree(
    [
      entry('h1', null, 'user'),
      entry('a1', 'h1'),
      entry('b1', 'a1', 'user'),
      entry('c1', 'b1'),
      entry('d1', 'c1'),
      entry('e1', 'b1'),
    ],
    leafId,
  );
}

/**
 * A fork inside a fork, to tell one line's end from another's:
 *
 *   f1 ─┬─ g1 ─┬─ i1
 *       │      └─ i2
 *       └─ h1
 */
function nestedForkTree(): SessionTree {
  return tree(
    [
      entry('f1', null, 'user'),
      entry('g1', 'f1'),
      entry('i1', 'g1'),
      entry('i2', 'g1'),
      entry('h1', 'f1'),
    ],
    'i2',
  );
}

/** Two roots in one file, which is what puts version headers in the list. */
function twoTreeSession(): SessionTree {
  return tree(
    [entry('r1', null, 'user'), entry('r2', 'r1'), entry('s1', null, 'user'), entry('s2', 's1')],
    's2',
  );
}

function listOf(session: SessionTree): {
  items: SessionTreeListItem[];
  rows: SessionTreeFlatRow[];
  display: SessionTreeDisplay;
  offsets: number[];
} {
  const data = createSessionTreeData(session);
  const visible = new Set(data.allItemIds);
  const display = buildSessionTreeDisplay(data, visible);
  const rows = flattenSessionTreeDisplay(display);
  const items = buildSessionTreeListItems(data, rows);
  return { items, rows, display, offsets: listItemOffsetsPx(items, 28) };
}

function itemIndexOf(items: SessionTreeListItem[], itemId: string): number {
  return items.findIndex((item) => item.kind === 'row' && item.row.itemId === itemId);
}

describe('collectVisibleItemIds', () => {
  it('shows every row while nothing is folded', () => {
    const data = createSessionTreeData(forkTree());
    expect([...collectVisibleItemIds(data, data.allItemIds, new Set())].sort()).toEqual(
      [...data.allItemIds].sort(),
    );
  });

  it('hides the subtree of a folded row, and shows it again when it is open', () => {
    const data = createSessionTreeData(forkTree());
    const withoutC1 = collectVisibleItemIds(
      data,
      data.allItemIds.filter((id) => id !== 'c1'),
      new Set(),
    );

    expect(withoutC1.has('c1')).toBe(true);
    expect(withoutC1.has('d1')).toBe(false);
    expect(withoutC1.has('e1')).toBe(true);
    // Folding a row leaves the continuation chain above and below it alone.
    expect(withoutC1.has('b1')).toBe(true);
  });

  it('hides a whole version when its tree is folded', () => {
    const data = createSessionTreeData(twoTreeSession());
    const visible = collectVisibleItemIds(data, data.allItemIds, new Set(['s1']));

    expect([...visible]).toEqual(['r1', 'r2']);
  });
});

describe('buildSessionTreeListItems', () => {
  it('weaves a header in front of every version, and only when there are several', () => {
    const two = listOf(twoTreeSession());
    expect(
      two.items.map((item) => (item.kind === 'header' ? `#${item.position}` : item.row.itemId)),
    ).toEqual(['#1', 'r1', 'r2', '#2', 's1', 's2']);
    expect(two.items[0]).toMatchObject({ kind: 'header', isFirst: true, statsItemId: 'r1' });

    // One tree: no header, so a plain session has no chrome above its rows.
    const one = listOf(forkTree());
    expect(one.items.every((item) => item.kind === 'row')).toBe(true);
    expect(one.items).toHaveLength(6);
  });

  it('keeps a version without rows in the list, so its header stays reachable', () => {
    const data = createSessionTreeData(twoTreeSession());
    // The second tree folded away: only its header is left.
    const display = buildSessionTreeDisplay(data, new Set(['r1', 'r2']));
    const items = buildSessionTreeListItems(data, flattenSessionTreeDisplay(display));

    expect(items.map((item) => (item.kind === 'header' ? `#${item.position}` : 'row'))).toEqual([
      '#1',
      'row',
      'row',
      '#2',
    ]);
  });
});

describe('item heights and offsets', () => {
  it('gives a row its own height, and a fork child the spacing its line covers', () => {
    const { items, offsets } = listOf(forkTree());

    // `h1` starts a chain (32px); `c1` and `e1` hang under the fork (+2px), and
    // `d1` continues `c1` at the plain height.
    expect(items.map((item) => listItemHeightPx(item, 28))).toEqual([32, 32, 32, 34, 32, 34]);
    expect(offsets).toEqual([0, 32, 64, 96, 130, 162]);
    // The offsets are the starts of the items, not their ends: the last row's
    // height is what the list's total height adds on top of the last offset.
    expect(
      offsets.reduce((total, _offset, index) => total + listItemHeightPx(items[index], 28), 0),
    ).toBe(196);
  });

  it('counts a measured header into the offsets of everything below it', () => {
    const { items } = listOf(twoTreeSession());
    expect(listItemOffsetsPx(items, 40)).toEqual([0, 40, 72, 104, 144, 176]);
  });
});

describe('findTopRowIndex', () => {
  const { items, offsets } = listOf(forkTree());

  it('names the row at the top of the viewport', () => {
    // At the top: the row the list starts with.
    expect(findTopRowIndex(items, offsets, 0, 0)).toBe(0);
    // Ten pixels into `b1`: the row whose body the reader is looking at.
    expect(findTopRowIndex(items, offsets, 64 + 10, 0)).toBe(itemIndexOf(items, 'b1'));
    // Its body is over: the fork's child has started, spacing included.
    expect(findTopRowIndex(items, offsets, 96 + 10, 0)).toBe(itemIndexOf(items, 'c1'));
  });

  it('answers with a row when the top lands on a header, and past the end', () => {
    const two = listOf(twoTreeSession());
    // The second header is the item at the top there. What is behind it is the
    // tree the reader is in, so the answer is the row below it.
    expect(findTopRowIndex(two.items, two.offsets, 96, 28)).toBe(itemIndexOf(two.items, 's1'));
    expect(findTopRowIndex(two.items, two.offsets, 100_000, 28)).toBe(itemIndexOf(two.items, 's2'));
  });
});

describe('findLitRowId', () => {
  const { rows } = listOf(forkTree());
  const data = createSessionTreeData(forkTree());

  it('follows the pointer, and falls back to the row closest to the leaf', () => {
    expect(findLitRowId(rows, data.activePathIds, 'e1')).toBe('e1');
    expect(findLitRowId(rows, data.activePathIds, null)).toBe('d1');
  });

  it('stands in with the deepest row still in the list when the leaf is hidden', () => {
    const folded = createSessionTreeData(forkTree());
    const displayWithoutC1 = buildSessionTreeDisplay(folded, new Set(['h1', 'a1', 'b1', 'e1']));
    const rowsWithoutC1 = flattenSessionTreeDisplay(displayWithoutC1);

    // `d1` is gone with its branch, so the row closest to the leaf carries the
    // light. Nothing above it indents: a lone child continues its parent.
    expect(findLitRowId(rowsWithoutC1, folded.activePathIds, null)).toBe('b1');
    expect(displayWithoutC1.depthById.get('e1')).toBe(0);
  });
});

describe('collectRailSpans', () => {
  function spansOf(
    session: SessionTree,
    litRowId: string | null,
  ): {
    items: SessionTreeListItem[];
    rows: SessionTreeFlatRow[];
    offsets: number[];
    pathOwners: ReadonlyMap<number, string>;
    spans: ReturnType<typeof collectRailSpans>;
  } {
    const { items, rows, display, offsets } = listOf(session);
    const pathOwners =
      litRowId === null
        ? new Map<number, string>()
        : collectPathOwners(litRowId, display.parentById, display.depthById);
    return {
      items,
      rows,
      offsets,
      pathOwners,
      spans: collectRailSpans(items, offsets, pathOwners, litRowId),
    };
  }

  it('runs a fork’s line from just above its first child to its last child’s elbow', () => {
    const { spans } = spansOf(forkTree(), null);

    expect(spans).toHaveLength(1);
    // `c1` starts the fork at 96, so the line starts two pixels above it; `e1`
    // is the last child at 162, and its elbow sits at its centre. The fork itself
    // is depth 0, and its children hang one level in.
    expect(spans[0]).toMatchObject({
      firstChildItemId: 'c1',
      forkDepth: 0,
      topPx: 96,
      endPx: 162 + 2 + ROW_HEIGHT_PX / 2,
      litEndPx: null,
    });
    expect(railLeftPx(1) - railLeftPx(0)).toBe(20);
    expect(railLeftPx(0)).toBe(rowContentX(0) + 8 - 1);
  });

  it('lights the run down to a row deep inside the branch, spacing and all', () => {
    // The light is on `d1`, a continuation inside the first branch: the fork's
    // lit run reaches the centre of that row, not just the fork.
    const { spans } = spansOf(forkTree(), 'd1');

    expect(spans[0].litEndPx).toBe(130 + ROW_HEIGHT_PX / 2);
    // 96 (the fork's top) → 146: two pixels of spacing, the fork child, the
    // continuation, and the centre of the row the run leads to.
    expect((spans[0].litEndPx ?? 0) - spans[0].topPx).toBe(
      BRANCH_SPACING_PX + ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2,
    );
  });

  it('lights the sibling a path passes on the way down', () => {
    // The light is on `e1`: the path passes `c1`'s whole subtree, so the run
    // covers the fork child and its continuation before turning in.
    const { spans } = spansOf(forkTree(), 'e1');

    // From two pixels above `c1` down to the centre of `e1`: the spacing, `c1`,
    // the continuation below it, the spacing in front of `e1`, and half of it.
    expect(spans[0].litEndPx).toBe(162 + BRANCH_SPACING_PX + ROW_HEIGHT_PX / 2);
    expect((spans[0].litEndPx ?? 0) - spans[0].topPx).toBe(
      BRANCH_SPACING_PX + ROW_HEIGHT_PX + ROW_HEIGHT_PX + BRANCH_SPACING_PX + ROW_HEIGHT_PX / 2,
    );
  });

  it('keeps a fork the path does not go through quiet, and gives every fork its own line', () => {
    // The light is on `h1`, in the outer fork's second branch: the inner fork's
    // line stays quiet while the outer one lights down to `h1`.
    const { spans, items, offsets } = spansOf(nestedForkTree(), 'h1');
    const centreOf = (itemId: string): number =>
      offsets[itemIndexOf(items, itemId)] + BRANCH_SPACING_PX + ROW_HEIGHT_PX / 2;

    // The inner fork hangs one level in (its row is a child of the outer fork),
    // and it closes first, so it is the first span out of the walk.
    expect(spans.map((span) => span.forkDepth)).toEqual([1, 0]);
    const [inner, outer] = spans;
    expect(inner.firstChildItemId).toBe('i1');
    expect(inner.litEndPx).toBe(null);
    expect(outer.firstChildItemId).toBe('g1');
    expect(outer.litEndPx).toBe(centreOf('h1'));
    // The inner line ends at `i2`'s elbow, the outer one at `h1`'s: one row and
    // the spacing in front of it further down.
    expect(outer.endPx - inner.endPx).toBe(ROW_HEIGHT_PX + BRANCH_SPACING_PX);
  });

  it('marks the row the light turns in at', () => {
    const { rows, pathOwners } = spansOf(forkTree(), 'd1');

    // `c1` is the branch child the path enters; its sibling is passed instead.
    expect(
      isRailOwner(rows.find((row) => row.itemId === 'c1') as SessionTreeFlatRow, pathOwners),
    ).toBe(true);
    expect(
      isRailOwner(rows.find((row) => row.itemId === 'e1') as SessionTreeFlatRow, pathOwners),
    ).toBe(false);
  });

  it('has nothing to draw for a plain chain', () => {
    const chain = tree([entry('x1', null, 'user'), entry('x2', 'x1')], 'x2');
    expect(spansOf(chain, 'x2').spans).toEqual([]);
  });
});
