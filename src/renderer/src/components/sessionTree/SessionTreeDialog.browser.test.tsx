import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { SessionTree, SessionTreeEntry } from '../../../../shared/ipcContract';
import { installFakePiApi } from '../../testing/fakePiApi';
import { sessionTree, sessionTreeEntry } from '../../testing/sessionTreeFixtures';
import { ROW_HEIGHT_PX } from './sessionTreeGeometry';
import SessionTreeDialog from './SessionTreeDialog';
// The rows are 32px tall and the list scrolls only because the app's own CSS says
// so: these tests measure the real thing, styles included.
import '../../assets/main.css';

const SESSION_PATH = '/tmp/sessions/browser.jsonl';

/**
 * A chain long enough to scroll, with previews long enough that every row has to
 * cut its text off — which is what the hover card is for.
 */
function longSession(count: number): SessionTree {
  const preview = (index: number): string =>
    `Message ${index} whose preview runs on well past the end of the row, so the row has to cut it off and the hover card has something to show`;
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
