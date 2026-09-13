import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { SessionTree, SessionTreeEntry } from '../../../../shared/ipcContract';
import { installFakePiApi } from '../../testing/fakePiApi';
import { sessionTree, sessionTreeEntry } from '../../testing/sessionTreeFixtures';
import { BRANCH_LAST_RAIL_HEIGHT_PX, ROW_HEIGHT_PX } from './sessionTreeGeometry';
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

  const list = requireElement<HTMLElement>('[role=tree]');
  expect(list.scrollHeight).toBeGreaterThan(list.clientHeight + ROW_HEIGHT_PX * 4);
  await expect.poll(() => list.scrollTop).toBeGreaterThan(0);

  const current = requireElement<HTMLElement>('[data-tree-current=true]');
  const listRect = list.getBoundingClientRect();
  const rowRect = current.getBoundingClientRect();
  expect(rowRect.top).toBeGreaterThanOrEqual(listRect.top - 1);
  expect(rowRect.bottom).toBeLessThanOrEqual(listRect.bottom + 1);
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
  await expect.element(screen.getByTestId('session-tree-preview')).toBeVisible();
});

test('scrolls a search result into view and hands it the keyboard', async () => {
  // Two matches: the first is far above the rows the list is sitting on, so the
  // filter alone does not put it on screen — the list has to scroll to it.
  const screen = await renderDialog(longSession(200, [55, 190]));
  const list = requireElement<HTMLElement>('[role=tree]');
  const listRect = list.getBoundingClientRect();
  // The dialog opens at the current row, which is the last one.
  await expect.poll(() => list.scrollTop).toBeGreaterThan(1760);

  await screen.getByRole('textbox').fill('needle');

  await expect.poll(() => list.scrollTop).toBeLessThanOrEqual(55 * ROW_HEIGHT_PX);
  const selected = requireElement<HTMLElement>('[data-tree-selected=true]');
  expect(selected.dataset.treeRowId).toBe('e55');
  const rowRect = selected.getBoundingClientRect();
  expect(rowRect.top).toBeGreaterThanOrEqual(listRect.top - 1);
  expect(rowRect.bottom).toBeLessThanOrEqual(listRect.bottom + 1);
});

test('pins the branch the top row hangs from, and only once it is scrolled past', async () => {
  await renderDialog(forkedSession());
  const list = requireElement<HTMLElement>('[role=tree]');
  const rowIds = (): (string | undefined)[] =>
    [...document.querySelectorAll<HTMLElement>('[data-tree-row-id]')].map(
      (element) => element.dataset.treeRowId,
    );
  const pinnedIds = (): (string | undefined)[] =>
    [...document.querySelectorAll<HTMLElement>('[data-tree-pinned-id]')].map(
      (element) => element.dataset.treePinnedId,
    );

  // Nothing has scrolled past at the top, so there is no band to show.
  expect(pinnedIds()).toEqual([]);

  // Put `y20` at the top of the list. The rows from there down hang from two
  // forks: the inner one that starts the long chain, inside the outer one.
  const index = rowIds().indexOf('y20');
  expect(index).toBeGreaterThan(0);
  list.scrollTop = index * ROW_HEIGHT_PX;

  await expect.poll(pinnedIds).toEqual(['u4', 'b3']);
});

test('lights the run down to a hovered row, and takes it away again', async () => {
  const screen = await renderDialog(forkedSession());
  const branchRail = (rowId: string): HTMLElement => {
    const row = requireElement<HTMLElement>(`[data-tree-row-id="${rowId}"]`);
    const rail = row
      .closest('[data-tree-branch=true]')
      ?.querySelector<HTMLElement>('span[aria-hidden=true]');
    if (!rail) throw new Error(`no branch line above ${rowId}`);
    return rail;
  };
  const paintOf = (rowId: string): string => getComputedStyle(branchRail(rowId)).backgroundColor;
  const heightOf = (rowId: string): number => branchRail(rowId).getBoundingClientRect().height;

  // The pointer starts on the search box, so the only lit path is the one the
  // session left: down to the leaf in the short branch. Both other branches are quiet.
  await screen.getByRole('textbox').hover();
  const litPath = paintOf('s1');
  const quiet = paintOf('y20');
  const quietElsewhere = paintOf('x1');
  expect(litPath).not.toBe(quiet);
  expect(quiet).toBe(quietElsewhere);
  // A line with nothing to cover is the run down to its own elbow, no more.
  expect(heightOf('y20')).toBeCloseTo(BRANCH_LAST_RAIL_HEIGHT_PX, 0);

  await screen.getByTestId('session-tree-row').filter({ hasText: 'message y20' }).hover();

  // Pointing at a row deep in the long chain lights that chain's line — and the run
  // reaches all the way down to the row, not just to the fork it hangs from.
  await expect.poll(() => paintOf('y20')).toBe(litPath);
  expect(heightOf('y20')).toBeCloseTo(BRANCH_LAST_RAIL_HEIGHT_PX + 19 * ROW_HEIGHT_PX, 0);
  // The way down passes the other branch of the inner fork, so its line lights too.
  await expect.poll(() => paintOf('x1')).toBe(litPath);

  // Off the rows again: the light goes back to the leaf's path, and the run with it.
  await screen.getByRole('textbox').hover();
  await expect.poll(() => paintOf('y20')).toBe(quiet);
  expect(heightOf('y20')).toBeCloseTo(BRANCH_LAST_RAIL_HEIGHT_PX, 0);
});
