import { beforeEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { peekDiagram, renderDiagram } from '../../lib/mermaidRenderer';
import { useSettingsStore } from '../../state/settingsStore';
import { applyAppearance } from '../../appearance/applyAppearance';
import { DEFAULT_APPEARANCE } from '../../../../shared/appearance';
import { findOccurrenceRanges } from '../../lib/highlightMatches';
import MarkdownMessage from './markdownMessage';
import MermaidDiagram from './mermaidDiagram';
// The diagram is laid out from the app's own tokens and sized by its CSS: this
// layer measures the real thing, styles included.
import '../../assets/main.css';

const FLOWCHART =
  'flowchart TD\n  A[Start] --> B{Ready?}\n  B -- yes --> C[Ship it]\n  B -- no --> A';
const BROKEN = 'this is not a diagram at all';
/** A label with a line break in it: mermaid renders that as an HTML `<br>`. */
const WRAPPED_LABEL = 'flowchart TD\n  A["First line<br/>Second line"] --> B[Done]';
/** Long enough that the height cap in the CSS has to bind. */
const TALL_CHART = [
  'flowchart TD',
  ...Array.from({ length: 14 }, (_, index) => `  S${String(index)} --> S${String(index + 1)}`),
].join('\n');
/** Wider than the transcript gives it, so the block has to shrink it to fit. */
const WIDE_CHART = [
  'flowchart LR',
  ...Array.from(
    { length: 10 },
    (_, index) => `  W${String(index)}[第${String(index)}步：一段中文说明]`,
  ),
  ...Array.from({ length: 9 }, (_, index) => `  W${String(index)} --> W${String(index + 1)}`),
].join('\n');
/** Labels written the way a model that is trying its luck would write them. */
const HOSTILE_LABEL = [
  'flowchart TD',
  '  A["<a href=\'javascript:window.__mermaidPwned=true\'>tap</a>"] --> B["<img src=x onerror=\'window.__mermaidPwned=true\'>"]',
  '  B --> C["<script>window.__mermaidPwned=true</script>"]',
].join('\n');

function setAppMode(mode: 'light' | 'dark'): void {
  applyAppearance({ ...DEFAULT_APPEARANCE, mode });
}

beforeEach(() => {
  setAppMode('light');
});

/**
 * Wait for something the app renders, in real time.
 *
 * A drawing lands a beat after the source does, when the render has been
 * committed: polling through `expect.poll` never saw that commit, a plain timer
 * loop does.
 */
async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  expect(check()).toBe(true);
}

async function openOverlay(screen: { container: HTMLElement }): Promise<HTMLElement> {
  await userEvent.click(svgIn(graphicIn(screen.container)));
  await waitFor(() => document.querySelector('[data-rmiz-modal]')?.hasAttribute('open') === true);
  const surface = document.querySelector<HTMLElement>('.zoom-pan-surface');
  if (!surface) throw new Error('the overlay has no surface');
  // The overlay animates the drawing up to the size it opens at; a width read
  // before that ends is a frame of the animation, not the size the reader is
  // given.
  let width = -1;
  await waitFor(() => {
    const next = zoomedDrawing().getBoundingClientRect().width;
    const settled = next === width;
    width = next;
    return settled;
  });
  return surface;
}

function overlayIsOpen(): boolean {
  return document.querySelector('dialog[data-rmiz-modal]')?.hasAttribute('open') === true;
}

function zoomedDrawing(): SVGSVGElement {
  return svgIn(document.querySelector('[data-rmiz-modal-content]') ?? document);
}

/**
 * A trackpad pinch-out over the middle of the drawing, as Chromium delivers it: a
 * ctrl+wheel. Zoom centres on the pointer, so a pinch at the corner would leave
 * the drawing against its bounds with no room to pan one way.
 */
function pinch(): WheelEvent {
  const box = zoomedDrawing().getBoundingClientRect();
  return new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -120,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * A drag, as a browser delivers one: pointer events for the app, and the mouse
 * events the overlays themselves are listening to.
 */
function drag(target: Element, from: [number, number], to: [number, number]): void {
  const [fromX, fromY] = from;
  const [toX, toY] = to;
  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: fromX,
      clientY: fromY,
    }),
  );
  target.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: fromX,
      clientY: fromY,
    }),
  );
  for (const [x, y] of [
    [(fromX + toX) / 2, (fromY + toY) / 2],
    [toX, toY],
  ]) {
    // `buttons`: a move with none pressed is how the pan library learns a drag ended.
    target.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: x, clientY: y }),
    );
    target.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: x, clientY: y }),
    );
  }
  target.dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, clientX: toX, clientY: toY }),
  );
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: toX, clientY: toY }));
}

function graphicIn(container: ParentNode): HTMLElement {
  const graphic = container.querySelector<HTMLElement>('[data-testid=mermaid-diagram]');
  if (!graphic) throw new Error('no diagram has been drawn');
  return graphic;
}

function svgIn(container: ParentNode): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (!(svg instanceof SVGSVGElement)) throw new Error('no diagram has been drawn');
  return svg;
}

test('draws a mermaid block as a diagram', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  const block = screen.getByTestId('mermaid-block').element();

  // Drawing measures text and lays out the graph, so it lands a beat after the
  // first render; until then the block shows the source it was given.
  expect(block.querySelector('[data-testid=mermaid-source]')).not.toBeNull();
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  const graphic = graphicIn(block);
  const drawing = svgIn(graphic);
  const box = drawing.getBoundingClientRect();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(graphic.textContent).toContain('Start');

  // The drawing is mermaid's own root, sized the way it laid the diagram out,
  // and it brings nothing with it that has to be loaded separately.
  expect(drawing.getAttribute('viewBox')).not.toBeNull();
  expect(Number(drawing.getAttribute('width'))).toBeGreaterThan(0);
  expect(graphic.querySelector('style')).toBeNull();

  // Two drawings of the same source carry the same ids: they are the same drawing.
  expect(drawing.id).toMatch(/^pigi-mermaid-/);

  // And its text is this document's text, so the search can see it.
  expect(graphic.closest('[data-search-ignore]')).toBeNull();
});

test('draws a diagram whose label carries an HTML line break', async () => {
  const screen = await render(<MermaidDiagram code={WRAPPED_LABEL} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  // A label is HTML inside the drawing, so a `<br>` must not cost the whole picture.
  const graphic = graphicIn(screen.container);
  expect(graphic.textContent).toContain('First line');
  expect(graphic.textContent).toContain('Second line');
  expect(graphic.querySelector('br')).not.toBeNull();
  expect(svgIn(graphic).getBoundingClientRect().height).toBeGreaterThan(0);
});

test('caps a tall diagram without stretching it', async () => {
  const screen = await render(<MermaidDiagram code={TALL_CHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  const drawing = svgIn(graphicIn(screen.container));
  // The cap binds: without it the drawing would be taller than the block the
  // transcript gives it. The size is mermaid's own, taken from the viewBox.
  expect(Number(drawing.getAttribute('height'))).toBeGreaterThan(420);
  expect(drawing.getBoundingClientRect().height).toBeLessThanOrEqual(421);
  // And it keeps its own proportions inside that box instead of being squeezed
  // into it: one scale for both axes throughout the drawing.
  const scale = drawing.getScreenCTM();
  expect(scale).not.toBeNull();
  expect(Math.abs((scale?.a ?? 0) - (scale?.d ?? 0))).toBeLessThan(0.01);
});

test('opens a drawing the transcript had to shrink at the size it was laid out', async () => {
  const screen = await render(<MermaidDiagram code={WIDE_CHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  // The block is narrower than the drawing, so it shrinks it to fit — the size
  // the reader is opening it to get away from.
  const installed = svgIn(graphicIn(screen.container));
  const laidOut = Number(installed.getAttribute('width'));
  expect(laidOut).toBeGreaterThan(0);
  expect(installed.getBoundingClientRect().width).toBeLessThan(laidOut);

  await openOverlay(screen);
  // The overlay fits its content to the window, and its content is a copy of
  // that block: fitting the copy would hand back the small drawing, so a
  // drawing opens at the size mermaid laid it out at instead.
  const zoomed = zoomedDrawing();
  const box = zoomed.getBoundingClientRect();
  expect(box.width).toBeGreaterThanOrEqual(laidOut - 2);
  // Its labels are drawn at that size as well: one line of mermaid's 16px type
  // is 24 units tall, a few pixels of which is what the block showed.
  const zoomedLabel = [...zoomed.querySelectorAll<HTMLElement>('foreignObject div')].find(
    (label) => (label.textContent ?? '') !== '',
  );
  if (!zoomedLabel) throw new Error('the drawing has no label');
  expect(zoomedLabel.getBoundingClientRect().height).toBeGreaterThan(20);

  // And the part that no longer fits is the reader's to reach: a drag on the
  // drawing takes it a real distance, and does not dismiss the overlay.
  const from: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];
  drag(zoomed, from, [from[0] - 200, from[1]]);
  await waitFor(() => zoomedDrawing().getBoundingClientRect().x < box.x - 100, 2000);
  expect(overlayIsOpen()).toBe(true);
});

test('keeps a drawing at its own size when the window shrinks under it', async () => {
  const screen = await render(<MermaidDiagram code={WIDE_CHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const laidOut = Number(svgIn(graphicIn(screen.container)).getAttribute('width'));
  await openOverlay(screen);

  // The width the overlay gives its copy of the block, from the style it sets.
  const fittedCopy = (): number => {
    const copy = document.querySelector<HTMLElement>('[data-rmiz-modal-img]');
    return Number.parseFloat(copy?.style.width ?? '');
  };
  const fitted = fittedCopy();

  await page.viewport(900, 700);
  try {
    // The overlay re-fits that copy to the smaller window…
    await waitFor(() => fittedCopy() < fitted - 50, 2000);
    // …and the drawing holds the size it was laid out at through it, instead of
    // following the copy back down towards the block.
    await waitFor(() => zoomedDrawing().getBoundingClientRect().width >= laidOut - 2, 2000);
  } finally {
    await userEvent.keyboard('{Escape}');
    await page.viewport(1200, 820);
  }
});

test('leaves a drawing the reader has zoomed alone when the window changes', async () => {
  const screen = await render(<MermaidDiagram code={WIDE_CHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const laidOut = Number(svgIn(graphicIn(screen.container)).getAttribute('width'));
  await openOverlay(screen);

  const opened = zoomedDrawing().getBoundingClientRect().width;
  zoomedDrawing().dispatchEvent(pinch());
  await waitFor(() => zoomedDrawing().getBoundingClientRect().width > opened + 1, 2000);
  const pinched = zoomedDrawing().getBoundingClientRect().width;

  await page.viewport(900, 700);
  try {
    // The auto scale is a starting point, not a leash: once the reader has
    // zoomed, a resize leaves that zoom in place. The drawing follows the
    // smaller window, and is not put back to its own size either.
    await waitFor(() => zoomedDrawing().getBoundingClientRect().width < pinched - 100, 2000);
    expect(zoomedDrawing().getBoundingClientRect().width).toBeGreaterThan(laidOut + 100);
  } finally {
    await userEvent.keyboard('{Escape}');
    await page.viewport(1200, 820);
  }
});

test('opens a tall drawing at its own height, not the box the block capped it to', async () => {
  const screen = await render(<MermaidDiagram code={TALL_CHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const installed = svgIn(graphicIn(screen.container));
  const laidOut = Number(installed.getAttribute('height'));
  expect(installed.getBoundingClientRect().height).toBeLessThan(laidOut);

  await openOverlay(screen);
  expect(zoomedDrawing().getBoundingClientRect().height).toBeGreaterThanOrEqual(laidOut - 2);
});

test('leaves a mermaid fence that is still open as a code block', async () => {
  // What a streaming message looks like: the closing fence has not arrived, so
  // there is nothing to draw yet — and nothing is attempted.
  const screen = await render(
    <MarkdownMessage text={'Before\n\n```mermaid\nflowchart TD\n  A --> B'} />,
  );
  const block = screen.container.querySelector<HTMLElement>('.markdown-code-block');

  expect(block).not.toBeNull();
  expect(block?.querySelector('[data-testid=mermaid-diagram]')).toBeNull();
  await expect.element(screen.getByText('flowchart TD')).toBeVisible();
});

test('draws the fence once it is closed, in a message that keeps streaming after it', async () => {
  const screen = await render(
    <MarkdownMessage
      text={'Before\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nand text after it.'}
    />,
  );

  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  expect(graphicIn(screen.container).textContent).toContain('A');
  await expect.element(screen.getByText('and text after it.')).toBeVisible();
});

test('keeps the source and says so when the diagram cannot be drawn', async () => {
  const screen = await render(<MermaidDiagram code={BROKEN} />);
  const block = screen.getByTestId('mermaid-block').element();

  await expect
    .element(screen.getByTestId('mermaid-diagram-error'), { timeout: 3000 })
    .toBeVisible();
  expect(block.querySelector('[data-testid=mermaid-source]')).not.toBeNull();
  expect(block.querySelector('[data-testid=mermaid-diagram]')).toBeNull();
  expect(block.querySelector('[id^=pigi-mermaid]')).toBeNull();
  // Mermaid draws a diagram of the failure into the document by default, where
  // it would sit outside the transcript and never leave.
  expect(document.body.querySelector(':scope > [id^=pigi-mermaid]')).toBeNull();
  expect(document.body.querySelector(':scope > [id^=dpigi-mermaid]')).toBeNull();
});

test('switches between the diagram and its source', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  const toggle = screen.getByTestId('mermaid-source-toggle');
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  await toggle.click();
  const block = screen.getByTestId('mermaid-block').element();
  expect(block.querySelector('[data-testid=mermaid-source]')).not.toBeNull();
  expect(block.querySelector('[data-testid=mermaid-diagram]')).toBeNull();

  await toggle.click();
  await expect.element(screen.getByTestId('mermaid-diagram')).toBeVisible();
});

test('leaves the drawing alone when the app switches to dark', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const inLight = graphicIn(screen.container).innerHTML;

  setAppMode('dark');

  // A diagram is drawn in its own theme (picked in settings), not the window's.
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(graphicIn(screen.container).innerHTML).toBe(inLight);
});

test('redraws the diagram when the text size changes', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const atDefaultSize = graphicIn(screen.container).innerHTML;

  // Labels are measured with the app's font, so a size change is a different
  // drawing — the layout inside it has to be made again.
  useSettingsStore.getState().updateAppearance((appearance) => ({
    ...appearance,
    light: { ...appearance.light, fonts: { ...appearance.light.fonts, uiSize: 18 } },
    dark: { ...appearance.dark, fonts: { ...appearance.dark.fonts, uiSize: 18 } },
  }));

  await waitFor(() => graphicIn(screen.container).innerHTML !== atDefaultSize);

  useSettingsStore.getState().updateAppearance((appearance) => ({
    ...appearance,
    light: { ...appearance.light, fonts: { ...appearance.light.fonts, uiSize: 15 } },
    dark: { ...appearance.dark, fonts: { ...appearance.dark.fonts, uiSize: 15 } },
  }));
});

test('gives two diagrams drawn with the same rules one stylesheet between them', async () => {
  const first = await render(<MermaidDiagram code={FLOWCHART} />);
  const second = await render(<MermaidDiagram code={FLOWCHART} />);
  await waitFor(
    () =>
      first.container.querySelector('[data-testid=mermaid-diagram]') !== null &&
      second.container.querySelector('[data-testid=mermaid-diagram]') !== null,
  );

  const firstGraphic = graphicIn(first.container);
  const secondGraphic = graphicIn(second.container);
  const scope = svgIn(firstGraphic).getAttribute('data-mermaid-scope');
  expect(scope).not.toBeNull();
  expect(svgIn(secondGraphic).getAttribute('data-mermaid-scope')).toBe(scope);
  // Two drawings of the same source are the same drawing, down to the name it
  // carries: nothing about a drawing depends on when it was drawn.
  expect(svgIn(secondGraphic).id).toBe(svgIn(firstGraphic).id);

  // The rules are lifted out of the drawing and put into the document once, so
  // a second diagram of the same kind costs the document nothing.
  expect(firstGraphic.querySelector('style')).toBeNull();
  expect(secondGraphic.querySelector('style')).toBeNull();
  expect(
    document.head.querySelectorAll(`style[data-mermaid-scope="${String(scope)}"]`).length,
  ).toBe(1);
});

test('leaves the text in a diagram selectable', async () => {
  // The transcript is the one place in the window where text may be selected.
  const screen = await render(
    <div className="user-content">
      <MermaidDiagram code={FLOWCHART} />
    </div>,
  );
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  const labels = [
    ...graphicIn(screen.container).querySelectorAll('foreignObject p, foreignObject span'),
  ];
  const label = labels.find((element) => element.textContent !== '');
  if (!label) throw new Error('no label has been drawn');
  expect(getComputedStyle(label).userSelect).not.toBe('none');

  const range = document.createRange();
  range.selectNodeContents(label);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  expect(window.getSelection()?.toString()).toBe(label.textContent);
});

test('finds the text inside a diagram with the transcript search', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  const body = graphicIn(screen.container).closest<HTMLElement>('.mermaid-diagram-body');
  if (!body) throw new Error('no diagram body');
  const ranges = findOccurrenceRanges(body, 'Ship it', 0);
  expect(ranges?.map((range) => range.toString()).join('')).toBe('Ship it');
});

test('keeps what a model writes in a label inert', async () => {
  const screen = await render(<MermaidDiagram code={HOSTILE_LABEL} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  // The diagram is drawn, so what follows is about markup that really reached
  // the browser rather than about a parse that never happened.
  const graphic = graphicIn(screen.container);
  expect(svgIn(graphic)).not.toBeNull();
  expect(graphic.innerHTML).not.toContain('<script');
  expect(graphic.querySelector('a[href^="javascript"]')).toBeNull();
  expect(graphic.querySelector('[onerror],[onclick]')).toBeNull();
  // An image a label brings along can only ever be one this app can serve: a
  // remote one is a request the window's own policy refuses.
  const sources = [...graphic.querySelectorAll('img,image')].map(
    (element) => element.getAttribute('src') ?? element.getAttribute('href') ?? '',
  );
  expect(sources.filter((source) => /^https?:/.test(source))).toEqual([]);
  expect('__mermaidPwned' in window).toBe(false);
});

test('opens the drawn diagram in a zoom overlay', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  await openOverlay(screen);
  // Dismissing it is the library's own behaviour, shared with the image preview.
  const zoomed = document.querySelector('[data-rmiz-modal-content] svg');
  expect(zoomed).not.toBeNull();
  expect(zoomed?.textContent).toContain('Start');
});

test('zooms and pans the drawing in the overlay, without dismissing it', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const surface = await openOverlay(screen);
  const startWidth = zoomedDrawing().getBoundingClientRect().width;

  // Wheels go to the drawing: the gesture listeners sit inside the surface, so
  // one dispatched on the surface never reaches them.
  // A plain wheel is a trackpad scroll: it pans, never zooms, and must not reach
  // the overlay, which dismisses itself on one.
  zoomedDrawing().dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }),
  );
  await nextFrame();
  expect(zoomedDrawing().getBoundingClientRect().width).toBeCloseTo(startWidth, 0);
  expect(overlayIsOpen()).toBe(true);

  zoomedDrawing().dispatchEvent(pinch());
  await waitFor(() => zoomedDrawing().getBoundingClientRect().width > startWidth + 1, 2000);
  expect(overlayIsOpen()).toBe(true);

  // Panning needs room, which a drawing fitted to the window does not have.
  const zoomedBox = zoomedDrawing().getBoundingClientRect();
  zoomedDrawing().dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 60, deltaY: 60 }),
  );
  await waitFor(() => zoomedDrawing().getBoundingClientRect().x !== zoomedBox.x, 2000);
  expect(zoomedDrawing().getBoundingClientRect().width).toBeCloseTo(zoomedBox.width, 0);
  expect(overlayIsOpen()).toBe(true);

  const drawing = zoomedDrawing();
  const box = drawing.getBoundingClientRect();
  drag(drawing, [box.x + 20, box.y + 20], [box.x + 90, box.y + 70]);
  await waitFor(() => zoomedDrawing().getBoundingClientRect().x !== box.x, 2000);

  // The click a drag ends with is the end of a gesture, not a request to close.
  drawing.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(overlayIsOpen()).toBe(true);

  surface.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => !overlayIsOpen());
});

test('opens a diagram at the size it was fitted to, every time', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  await openOverlay(screen);
  const fittedWidth = zoomedDrawing().getBoundingClientRect().width;

  zoomedDrawing().dispatchEvent(pinch());
  await waitFor(() => zoomedDrawing().getBoundingClientRect().width > fittedWidth + 1, 2000);

  await userEvent.keyboard('{Escape}');
  await waitFor(() => !overlayIsOpen());
  await openOverlay(screen);
  expect(Math.round(zoomedDrawing().getBoundingClientRect().width)).toBe(Math.round(fittedWidth));
});

test('draws a diagram someone else is already drawing once', async () => {
  // Two callers at once: what a component mounted twice asks for. They get one
  // drawing, and with it the same markup — a caller mounting into a drawing must
  // not be left holding one that the next caller replaces.
  const code = 'flowchart LR\n  One --> Two';
  const [first, second] = await Promise.all([
    renderDiagram(code, 'default'),
    renderDiagram(code, 'default'),
  ]);

  expect(first.ok).toBe(true);
  expect(second).toBe(first);
});

test('draws a diagram it has already drawn without going near the source again', async () => {
  // What a virtualized row does when it scrolls back into the window: the first
  // frame is the diagram, because the module remembers it.
  const sequence = 'sequenceDiagram\n  Alice->>Bob: ping\n  Bob-->>Alice: pong';
  const first = await renderDiagram(sequence, 'default');
  expect(first.ok).toBe(true);

  const remembered = peekDiagram(sequence, 'default');
  expect(remembered?.svg).toContain('<svg');
  // Remembered with the rules it was drawn with, which are written for a scope
  // rather than for the one id mermaid happened to give it.
  expect(remembered?.styles).toContain('[data-mermaid-scope=');
  expect(remembered?.styleScope).not.toBeNull();
  // The theme is part of what is remembered: the same source in the other theme
  // is a different drawing, and not one that has been made yet.
  expect(peekDiagram(sequence, 'dark')).toBeNull();
});

test('draws in the theme the reader picks, whatever the app is doing', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const asBundled = graphicIn(screen.container).innerHTML;

  useSettingsStore.getState().setDiagramTheme('forest');
  await waitFor(() => graphicIn(screen.container).innerHTML !== asBundled);

  setAppMode('dark');
  const forestInDark = graphicIn(screen.container).innerHTML;
  expect(forestInDark).not.toBe(asBundled);

  // The choice is sent to the settings owner for the next window, at commit
  // time: the spy has to be armed before the change, not after.
  const change = vi.spyOn(window.piApi, 'changePigiSettings');
  useSettingsStore.getState().setDiagramTheme('neutral');
  await waitFor(() => graphicIn(screen.container).innerHTML !== forestInDark);

  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({
      appearance: expect.objectContaining({ diagramTheme: 'neutral' }),
    }),
  );
  change.mockRestore();

  // Back to the theme this file started on, so the rest of it sees the same.
  setAppMode('light');
  useSettingsStore.getState().setDiagramTheme('default');
  await waitFor(() => graphicIn(screen.container).innerHTML === asBundled);
});
