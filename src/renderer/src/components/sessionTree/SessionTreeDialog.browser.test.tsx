import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { SessionTree, SessionTreeEntry } from '../../../../shared/ipcContract';
import { installFakePiApi } from '../../testing/fakePiApi';
import { sessionTree, sessionTreeEntry } from '../../testing/sessionTreeFixtures';
import { BRANCH_SPACING_PX, ROW_HEIGHT_PX } from './sessionTreeGeometry';
import SessionTreeDialog from './SessionTreeDialog';
// The rows are 32px tall and the list scrolls only because the app's own CSS says
// so: these tests measure the real thing, styles included.
import '../../assets/main.css';

const SESSION_PATH = '/tmp/sessions/browser.jsonl';

/**
 * A chain long enough to scroll, with previews long enough that every row has to
 * cut its text off — which is what the hover card is for.
 *
 * `markerAt` puts a word no other row has into the given rows, for a search whose
 * first match is a long way from where the list is sitting.
 */
function longSession(count: number, markerAt: readonly number[] = []): SessionTree {
  const preview = (index: number): string =>
    `Message ${index} whose preview runs on well past the end of the row, so the row has to cut it off and the hover card has something to show${markerAt.includes(index) ? ' needleneedle' : ''}`;
  const entries: SessionTreeEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push(
      sessionTreeEntry(
        index,
        `e${index}`,
        index === 0 ? null : `e${index - 1}`,
        index % 2 === 0 ? 'user' : 'assistant',
        preview(index),
      ),
    );
  }
  return sessionTree(entries, `e${count - 1}`);
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`nothing on the page matches ${selector}`);
  return element;
}

function rowIdsInDom(): (string | undefined)[] {
  return [...document.querySelectorAll<HTMLElement>('[data-tree-row-id]')].map(
    (element) => element.dataset.treeRowId,
  );
}

function pinnedIds(): (string | undefined)[] {
  return [...document.querySelectorAll<HTMLElement>('[data-tree-pinned-id]')].map(
    (element) => element.dataset.treePinnedId,
  );
}

/** Every drawn branch line: which fork's column, whether it is lit, and its paint. */
interface DrawnRail {
  forkDepth: number;
  lit: boolean;
  paint: string;
  height: number;
  top: number;
}

function drawnRails(): DrawnRail[] {
  return [...document.querySelectorAll<HTMLElement>('[data-tree-rail-fork-depth]')].map(
    (element) => {
      const rect = element.getBoundingClientRect();
      return {
        forkDepth: Number(element.dataset.treeRailForkDepth),
        lit: element.dataset.treeRailLit === 'true',
        paint: getComputedStyle(element).backgroundColor,
        height: Math.round(rect.height),
        top: Math.round(rect.top),
      };
    },
  );
}

/** The one line of a fork: `lit` picks the lit run or the rest of it. */
function railOf(forkDepth: number, lit: boolean): DrawnRail {
  const rail = drawnRails().find(
    (candidate) => candidate.forkDepth === forkDepth && candidate.lit === lit,
  );
  if (!rail) throw new Error(`no ${lit ? 'lit' : 'quiet'} line at fork depth ${forkDepth}`);
  return rail;
}

/**
 * Put a row's top edge at the top of the list, scrolling in steps first: a row far
 * down the list is not drawn yet, so it cannot be measured until the window reaches it.
 */
async function scrollRowToTop(rowId: string): Promise<void> {
  const list = requireElement<HTMLElement>('[role=tree]');
  for (let step = 0; step < 40; step += 1) {
    const row = document.querySelector<HTMLElement>(`[data-tree-row-id="${rowId}"]`);
    if (row) {
      const listRect = list.getBoundingClientRect();
      list.scrollTop += Math.round(row.getBoundingClientRect().top - listRect.top);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      return;
    }
    list.scrollTop += Math.floor(list.clientHeight / 2);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
  throw new Error(`${rowId} never came into the window`);
}

/**
 * A chain that forks twice, with the leaf left in the short branch:
 *
 *   u0 ─ u1 ─ u2 ─ u3 ─ u4 ─┬─ s1 (current, the leaf)
 *                           └─ b1 ─ b2 ─ b3 ─┬─ x1
 *                                           └─ y1 ─ … ─ y40
 *
 * Long enough to scroll into the deep branch, and with two levels of fork for the
 * pinned band to mirror. The leaf in the short branch is what makes the branch lines
 * distinguishable: at rest the accent is on `s1`'s line, not on the long chain's.
 */
function forkedSession(): SessionTree {
  const text = (label: string): string =>
    `${label}, whose preview runs on well past the end of the row`;
  const entries: SessionTreeEntry[] = [];
  for (let index = 0; index < 5; index += 1) {
    entries.push(
      sessionTreeEntry(
        index,
        `u${index}`,
        index === 0 ? null : `u${index - 1}`,
        'user',
        text(`message u${index}`),
      ),
    );
  }
  entries.push(sessionTreeEntry(5, 's1', 'u4', 'assistant', text('the short branch')));
  // A second version in the same file: it is folded away, and its header is what the
  // band has to make room for.
  for (let index = 0; index <= 4; index += 1) {
    entries.push(
      sessionTreeEntry(
        100 + index,
        `w${index}`,
        index === 0 ? null : `w${index - 1}`,
        'user',
        text(`second version ${index}`),
      ),
    );
  }
  entries.push(sessionTreeEntry(6, 'b1', 'u4', 'assistant', text('the long branch')));
  entries.push(sessionTreeEntry(7, 'b2', 'b1', 'assistant', text('still going')));
  entries.push(sessionTreeEntry(8, 'b3', 'b2', 'assistant', text('it forks again')));
  entries.push(sessionTreeEntry(9, 'x1', 'b3', 'assistant', text('the other path')));
  entries.push(sessionTreeEntry(10, 'y1', 'b3', 'assistant', text('the long path')));
  for (let index = 2; index <= 40; index += 1) {
    entries.push(
      sessionTreeEntry(
        10 + index,
        `y${index}`,
        `y${index - 1}`,
        'assistant',
        text(`message y${index}`),
      ),
    );
  }
  return sessionTree(entries, 's1');
}

async function renderDialog(tree: SessionTree): Promise<Awaited<ReturnType<typeof render>>> {
  installFakePiApi(tree);
  const screen = await render(
    <SessionTreeDialog
      open
      onOpenChange={vi.fn()}
      sessionPath={SESSION_PATH}
      revision="1"
      onSelect={vi.fn()}
    />,
  );
  await expect.element(screen.getByTestId('session-tree-row').first()).toBeVisible();
  return screen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('measures every row at the height the list budgeted for it', async () => {
  await renderDialog(longSession(40));

  const heights = [...document.querySelectorAll<HTMLElement>('[data-testid=session-tree-row]')].map(
    (row) => row.getBoundingClientRect().height,
  );
  expect(heights.length).toBeGreaterThan(3);
  // A virtual list decides how many rows fit from a fixed estimate, so every row
  // really has to be that tall — no wrapping, no shrinking.
  expect(heights.filter((height) => Math.abs(height - ROW_HEIGHT_PX) > 0.5)).toEqual([]);
});

test('opens at the current row and scrolls for the rest', async () => {
  await renderDialog(longSession(80));

  // The session's last row is off the bottom of the list when it mounts, and a row
  // outside the window is not drawn at all: the list has to scroll to it.
  await expect
    .poll(() => {
      const row = document.querySelector<HTMLElement>('[data-tree-current=true]');
      if (!row) return 'not drawn';
      const rowRect = row.getBoundingClientRect();
      const listRect = requireElement<HTMLElement>('[role=tree]').getBoundingClientRect();
      if (rowRect.top < listRect.top - 1) return 'above the view';
      if (rowRect.bottom > listRect.bottom + 1) return 'below the view';
      return 'in view';
    })
    .toBe('in view');

  const list = requireElement<HTMLElement>('[role=tree]');
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight + ROW_HEIGHT_PX * 4);
  expect(list.scrollTop).toBeGreaterThan(0);
});

test('paints the position in the theme colour and the keyboard row in grey', async () => {
  const screen = await renderDialog(longSession(20));

  // A search hands the first match to the keyboard, which is what the grey is for.
  await screen.getByRole('textbox').fill('Message');

  // Queried after the search: the rows re-render with it, so anything held from
  // before is detached and would report no style at all.
  const current = requireElement<HTMLElement>('[data-tree-current=true]');
  const selected = requireElement<HTMLElement>('[data-tree-selected=true]');
  const currentBox = current.firstElementChild;
  const selectedBox = selected.firstElementChild;
  const chip = [...current.querySelectorAll('span')].find((span) => span.textContent === 'Current');
  if (!currentBox || !selectedBox || !chip) {
    throw new Error('a row is missing its box, or the position is missing its chip');
  }

  const backgroundOf = (element: Element): string => getComputedStyle(element).backgroundColor;
  const currentBackground = backgroundOf(currentBox);
  const selectedBackground = backgroundOf(selectedBox);
  const chipBackground = backgroundOf(chip);
  // A painted colour in both cases: not the empty string a detached node reports,
  // and not transparent. jsdom can say neither of those.
  expect(currentBackground).not.toBe('');
  expect(currentBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(selectedBackground).not.toBe('');
  expect(selectedBackground).not.toBe('rgba(0, 0, 0, 0)');
  // Grey for the keyboard, the theme colour for the position: two different paints.
  expect(selectedBackground).not.toBe(currentBackground);
  // And the grey has to carry: a whisper-thin one is the same as no mark at all, so
  // its alpha is held above a floor here rather than left to look-right-by-eye.
  const alphaOf = (background: string): number =>
    Number(/([\d.]+)\)$/.exec(background)?.[1] ?? NaN);
  expect(alphaOf(selectedBackground)).toBeGreaterThanOrEqual(0.18);
  // The chip has to read on top of the row it sits in, or the position loses its mark.
  expect(chipBackground).not.toBe('');
  expect(chipBackground).not.toBe(currentBackground);
});

test('opens the hover card for a row whose text is cut off', async () => {
  const screen = await renderDialog(longSession(20));

  await screen.getByTestId('session-tree-row').first().hover();

  // The card exists to show what the row cut off, so it only appears when the text
  // really overflows — which is a measurement jsdom cannot make.
  // The card waits for the pointer to rest (half a second), so this looks for it
  // rather than expecting it on the spot; the wait itself is a jsdom test.
  await expect.element(screen.getByTestId('session-tree-preview'), { timeout: 3000 }).toBeVisible();
});

test('scrolls a search result into view and hands it the keyboard', async () => {
  // Two matches: the first is far above the rows the list is sitting on, so the
  // filter alone does not put it on screen — and a row outside the window is not
  // drawn at all, so the list has to scroll to it before it can be looked at.
  const screen = await renderDialog(longSession(200, [55, 190]));

  // The dialog opens at the current row, which is the last one.
  await expect
    .poll(() => requireElement<HTMLElement>('[role=tree]').scrollTop)
    .toBeGreaterThan(1760);
  expect(rowIdsInDom()).not.toContain('e55');

  await screen.getByRole('textbox').fill('needle');

  await expect
    .poll(() => document.querySelector<HTMLElement>('[data-tree-selected=true]')?.dataset.treeRowId)
    .toBe('e55');
  // The row is brought into view, not merely selected: it can be at the edge, but
  // not past it. The list is re-queried because the search remounts it.
  await expect
    .poll(() => {
      const row = document.querySelector<HTMLElement>('[data-tree-selected=true]');
      if (!row) return 'not drawn';
      const rowRect = row.getBoundingClientRect();
      const listRect = requireElement<HTMLElement>('[role=tree]').getBoundingClientRect();
      if (rowRect.top < listRect.top - 1) return 'above the view';
      if (rowRect.bottom > listRect.bottom + 1) return 'below the view';
      return 'in view';
    })
    .toBe('in view');
});

test('draws a window of rows, and a scrollbar as long as the whole session', async () => {
  await renderDialog(longSession(2000));
  const list = requireElement<HTMLElement>('[role=tree]');
  const listRect = list.getBoundingClientRect();

  // The list is 2000 rows tall to scroll through…
  expect(list.scrollHeight).toBe(2000 * ROW_HEIGHT_PX);
  // …but only a screenful of rows is in the document.
  const rows = [...document.querySelectorAll<HTMLElement>('[data-tree-row-id]')];
  expect(rows.length).toBeGreaterThan(8);
  expect(rows.length).toBeLessThanOrEqual(Math.ceil(listRect.height / ROW_HEIGHT_PX) + 20);

  // What is drawn is the window around the current row, not the start of the session.
  expect(rowIdsInDom()).toContain('e1999');
  expect(rowIdsInDom()).not.toContain('e0');
});

test('pins the branch the top row hangs from, and only once it is scrolled past', async () => {
  await renderDialog(forkedSession());

  // Nothing has scrolled past at the top, so there is no band to show.
  expect(pinnedIds()).toEqual([]);

  // Put `y20` at the top of the list. The rows from there down hang from two
  // forks: the inner one that starts the long chain, inside the outer one.
  await scrollRowToTop('y20');

  await expect.poll(pinnedIds).toEqual(['u4', 'b3']);
});

test('holds the tree header, and the pinned rows under it, at the top of the list', async () => {
  await renderDialog(forkedSession());
  const list = requireElement<HTMLElement>('[role=tree]');
  await scrollRowToTop('y20');
  await expect.poll(pinnedIds).toEqual(['u4', 'b3']);

  // The band owns the top of the list: the header of the version the rows belong to
  // is drawn there, so the strip above the pinned rows is never a see-through gap
  // with a row scrolling around in it.
  const listRect = list.getBoundingClientRect();
  const atTop = document.elementFromPoint(listRect.left + 60, listRect.top + 8);
  expect(atTop?.closest('[data-testid=session-tree-pinned]')).not.toBeNull();
  const headerAtTop = atTop?.closest('[data-testid=session-tree-pinned-header]');
  expect(headerAtTop?.textContent).toContain('Tree 1');
  // Painted, not transparent: what is under it may not show through.
  const headerBackground = headerAtTop ? getComputedStyle(headerAtTop).backgroundColor : 'none';
  expect(headerBackground).not.toMatch(/^rgba?\(0, 0, 0, 0\)$/);

  // The pinned rows start below that header, so both are readable.
  const pinnedRow = requireElement<HTMLElement>('[data-tree-pinned-id]');
  const pinnedTop = pinnedRow.getBoundingClientRect().top - listRect.top;
  expect(pinnedTop).toBeGreaterThanOrEqual(ROW_HEIGHT_PX - 4);
  expect(pinnedTop).toBeLessThanOrEqual(ROW_HEIGHT_PX + 8);
});

test('lights the run down to a hovered row, and takes it away again', async () => {
  const screen = await renderDialog(forkedSession());
  const rowBox = (rowId: string): DOMRect =>
    requireElement<HTMLElement>(`[data-tree-row-id="${rowId}"]`).getBoundingClientRect();
  const railEnd = (forkDepth: number, lit: boolean): number => {
    const rail = railOf(forkDepth, lit);
    return rail.top + rail.height;
  };

  // With the pointer nowhere near the rows, the only lit path is the one the
  // session left: down to `s1` in the short branch.
  await screen.getByRole('textbox').hover();
  const litPath = railOf(0, true).paint;
  expect(litPath).not.toBe(railOf(0, false).paint);
  // The run stops at the elbow of the row it leads to, and starts two pixels above
  // the fork's first child: the line covers the spacing it is drawn through.
  // Within a pixel: the line's own box is rounded when it is read, and a measured
  // header puts a fraction into everything below it.
  const withinPixel = (measured: number, expected: number): void => {
    expect(Math.abs(measured - expected)).toBeLessThanOrEqual(1);
  };
  withinPixel(railEnd(0, true), rowBox('s1').top + ROW_HEIGHT_PX / 2);
  withinPixel(railOf(1, false).top, rowBox('x1').top - BRANCH_SPACING_PX);
  const litRunAtRest = railOf(0, true).height;
  const quietRunAtRest = railOf(1, false).height;

  // The row to point at is deep in the long chain, so the window has to reach it
  // first: a row that is not drawn cannot be hovered.
  await scrollRowToTop('y20');
  await screen.getByTestId('session-tree-row').filter({ hasText: 'message y20' }).hover();

  // Pointing at a row deep in the long chain lights that chain's line — and the run
  // reaches all the way down to the row, not just to the fork it hangs from.
  await expect.poll(() => railOf(1, true).paint).toBe(litPath);
  const hoveredCentre = rowBox('y20').top + ROW_HEIGHT_PX / 2;
  withinPixel(railEnd(1, true), hoveredCentre);
  withinPixel(railEnd(0, true), hoveredCentre);
  expect(railOf(0, true).height).toBeGreaterThan(litRunAtRest);
  // The light went into the fork's last branch, so that line is lit end to end:
  // there is no quiet piece left over below it.
  expect(drawnRails().some((rail) => rail.forkDepth === 1 && !rail.lit)).toBe(false);

  // Off the rows again: the light goes back to the leaf's path, and the line runs
  // the whole way down its branch again.
  await screen.getByRole('textbox').hover();
  await expect
    .poll(() => drawnRails().some((rail) => rail.forkDepth === 1 && rail.lit))
    .toBe(false);
  expect(railOf(1, false).top).toBeCloseTo(rowBox('x1').top - BRANCH_SPACING_PX, 0);
  expect(railOf(1, false).height).toBeCloseTo(quietRunAtRest, 0);
  expect(railOf(0, true).height).toBeCloseTo(litRunAtRest, 0);
});
