import { afterEach, beforeEach, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { applyAppearance } from '../../appearance/applyAppearance';
import { DEFAULT_UI_FONT_SIZE } from '../../../../shared/appearance';
import MarkdownMessage from './markdownMessage';
import { useSettingsStore } from '../../state/settingsStore';
// The list gaps are the app's own CSS read off a real layout: jsdom cannot
// apply a stylesheet, so this layer measures the thing itself.
import '../../assets/main.css';

/** Ordered items sit at the prose step; bulleted ones at the tight item step. */
const ORDERED_ITEM_STEP = 0.8;
const BULLETED_ITEM_STEP = 0.3;
/** The largest text size the appearance settings offer, as a second sample. */
const LARGE_UI_FONT_SIZE = 18;

/** A reply with the three shapes that matter: steps, short bullets, and a
 * numbered list nested inside a bulleted one. */
const REPLY = [
  'To set the project up from a clean clone:',
  '',
  '1. Read `CONTRIBUTING.md` once for the rules and once more for the reasoning behind them',
  '2. Install the dependencies with npm install, which also links the shared worktree modules',
  '3. Copy `.env.example` to `.env` and fill in the two API keys the tools ask for',
  '4. Run the fixture generator once, so the first test run has the files it expects',
  '5. Start the dev server and open the localhost URL it prints',
  '6. File anything rough you find as an issue, with the failing command attached',
  '',
  'While you work:',
  '',
  '- The cache only warms after the first full run, so a slow first suite is normal',
  '- Screenshots live outside the repository, never inside it',
  '- When a test fails, work the smallest version of it:',
  '  1. Pick the smallest failing case',
  '  2. Write the assertion before the fix',
  '  3. Re-run the whole file once at the end',
].join('\n');

function requireElement<T extends Element>(selector: string, scope: ParentNode): T {
  const element = scope.querySelector<T>(selector);
  if (!element) throw new Error(`nothing on the page matches ${selector}`);
  return element;
}

/** The body text size the whole ladder multiplies, as the transcript reads it. */
function bodySizeIn(container: HTMLElement): number {
  const wrapper = requireElement<HTMLElement>('.text-body', container);
  return Number.parseFloat(getComputedStyle(wrapper).fontSize);
}

function marginTopOf(element: Element): number {
  return Number.parseFloat(getComputedStyle(element).marginTop);
}

/** Every item but the first of a list: the ones the li + li rule reaches. */
function itemsAfterTheFirst(list: Element): Element[] {
  return [...list.children].slice(1);
}

function expectItemsAtStep(list: Element, step: number, bodySize: number): void {
  const items = itemsAfterTheFirst(list);
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) {
    expect(marginTopOf(item)).toBeCloseTo(step * bodySize, 1);
  }
}

/** Sets the text size the way the Appearance settings page does. */
function setUiFontSize(size: number): void {
  useSettingsStore.getState().updateAppearance((appearance) => ({
    ...appearance,
    light: { ...appearance.light, fonts: { ...appearance.light.fonts, uiSize: size } },
    dark: { ...appearance.dark, fonts: { ...appearance.dark.fonts, uiSize: size } },
  }));
}

beforeEach(() => {
  applyAppearance(useSettingsStore.getState().appearance);
});

afterEach(() => {
  setUiFontSize(DEFAULT_UI_FONT_SIZE);
});

test('spaces ordered items wider than bulleted ones, at both text sizes', async () => {
  const screen = await render(
    <div className="text-body">
      <MarkdownMessage text={REPLY} />
    </div>,
  );

  const orderedList = requireElement<HTMLElement>('.markdown-body > ol', screen.container);
  const bulletedList = requireElement<HTMLElement>('.markdown-body > ul', screen.container);
  // An ordered list inside a bulleted one: its items are steps too, and the
  // nested list's own margin stays at the item spacing.
  const nestedOrderedList = requireElement<HTMLElement>('ol', bulletedList);
  expect(orderedList.children.length).toBe(6);
  expect(bulletedList.children.length).toBe(3);

  // The default body size, and both ladders against it.
  expect(bodySizeIn(screen.container)).toBeCloseTo(DEFAULT_UI_FONT_SIZE, 1);
  expectItemsAtStep(orderedList, ORDERED_ITEM_STEP, DEFAULT_UI_FONT_SIZE);
  expectItemsAtStep(bulletedList, BULLETED_ITEM_STEP, DEFAULT_UI_FONT_SIZE);
  expectItemsAtStep(nestedOrderedList, ORDERED_ITEM_STEP, DEFAULT_UI_FONT_SIZE);
  expect(marginTopOf(nestedOrderedList)).toBeCloseTo(BULLETED_ITEM_STEP * DEFAULT_UI_FONT_SIZE, 1);

  // The largest text size the settings offer: the whole ladder scales with it,
  // ordered and bulleted steps staying what they are relative to the body.
  setUiFontSize(LARGE_UI_FONT_SIZE);

  expect(bodySizeIn(screen.container)).toBeCloseTo(LARGE_UI_FONT_SIZE, 1);
  expectItemsAtStep(orderedList, ORDERED_ITEM_STEP, LARGE_UI_FONT_SIZE);
  expectItemsAtStep(bulletedList, BULLETED_ITEM_STEP, LARGE_UI_FONT_SIZE);
  expectItemsAtStep(nestedOrderedList, ORDERED_ITEM_STEP, LARGE_UI_FONT_SIZE);
  expect(marginTopOf(nestedOrderedList)).toBeCloseTo(BULLETED_ITEM_STEP * LARGE_UI_FONT_SIZE, 1);
});
