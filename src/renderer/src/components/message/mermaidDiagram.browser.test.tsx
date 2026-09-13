import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { peekDiagram, renderDiagram } from '../../lib/mermaidRenderer';
import { useAppStore } from '../../state/appStore';
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
/** Labels written the way a model that is trying its luck would write them. */
const HOSTILE_LABEL = [
  'flowchart TD',
  '  A["<a href=\'javascript:window.__mermaidPwned=true\'>tap</a>"] --> B["<img src=x onerror=\'window.__mermaidPwned=true\'>"]',
  '  B --> C["<script>window.__mermaidPwned=true</script>"]',
].join('\n');

afterEach(() => {
  document.documentElement.classList.remove('dark');
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

/** The overlay, opened by a click on the drawing. */
async function openOverlay(screen: { container: HTMLElement }): Promise<HTMLElement> {
  await userEvent.click(svgIn(graphicIn(screen.container)));
  await waitFor(() => document.querySelector('[data-rmiz-modal]')?.hasAttribute('open') === true);
  const surface = document.querySelector<HTMLElement>('.mermaid-zoom-surface');
  if (!surface) throw new Error('the overlay has no surface');
  return surface;
}

function overlayIsOpen(): boolean {
  return document.querySelector('dialog[data-rmiz-modal]')?.hasAttribute('open') === true;
}

/** The drawing inside the overlay. */
function zoomedDrawing(): SVGSVGElement {
  return svgIn(document.querySelector('[data-rmiz-modal-content]') ?? document);
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
    target.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }),
    );
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
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

  // Its ids come along with it. Two drawings of the same source carry the same
  // ids, which is what they are: the same drawing.
  expect(drawing.id).toMatch(/^pigi-mermaid-/);

  // And its text is this document's text, so the search can see it.
  expect(graphic.closest('[data-search-ignore]')).toBeNull();
});

test('draws a diagram whose label carries an HTML line break', async () => {
  const screen = await render(<MermaidDiagram code={WRAPPED_LABEL} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  // A label is HTML inside the drawing, so a `<br>` in it is a line break like
  // any other one rather than something that can cost the whole picture.
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
  // The prose around it is still there: the diagram replaced the block, not the
  // message.
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

test('redraws the diagram in the other theme', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const lightDrawing = graphicIn(screen.container).innerHTML;

  document.documentElement.classList.add('dark');
  await waitFor(() => graphicIn(screen.container).innerHTML !== lightDrawing);
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

  // A selection over the label is a selection of the label's text, the way
  // dragging across the drawing would leave one.
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
  // The overlay holds a copy of the same drawing, scaled to the window.
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

  // A wheel over the drawing is a gesture of the drawing's: it must not reach
  // the overlay, which dismisses itself on one.
  surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
  await waitFor(() => zoomedDrawing().getBoundingClientRect().width > startWidth + 1, 2000);
  expect(overlayIsOpen()).toBe(true);

  const drawing = zoomedDrawing();
  const box = drawing.getBoundingClientRect();
  drag(drawing, [box.x + 20, box.y + 20], [box.x + 90, box.y + 70]);
  await waitFor(() => zoomedDrawing().getBoundingClientRect().x !== box.x, 2000);

  // The click a drag ends with is the end of a gesture, not a request to close.
  drawing.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(overlayIsOpen()).toBe(true);

  // A click on the space around the drawing dismisses the overlay, the way the
  // overlay's own background does.
  surface.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => !overlayIsOpen());
});

test('opens a diagram at the size it was fitted to, every time', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();
  const surface = await openOverlay(screen);
  const fittedWidth = zoomedDrawing().getBoundingClientRect().width;

  surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
  await waitFor(() => zoomedDrawing().getBoundingClientRect().width > fittedWidth + 1, 2000);

  // Escape closes it, and the next visit starts where the drawing fits the
  // window rather than where the last one was left.
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
  const following = graphicIn(screen.container).innerHTML;

  // What a settings page would write: a mermaid theme of the reader's own.
  useAppStore.getState().setDiagramTheme('forest');
  await waitFor(() => graphicIn(screen.container).innerHTML !== following);

  // A picked theme is drawn whatever the window is doing, so switching the app's
  // own theme leaves the drawing alone.
  document.documentElement.classList.add('dark');
  const forestInDark = graphicIn(screen.container).innerHTML;
  expect(forestInDark).not.toBe(following);

  useAppStore.getState().setDiagramTheme('neutral');
  await waitFor(() => graphicIn(screen.container).innerHTML !== forestInDark);

  // The choice is remembered for the next window.
  expect(localStorage.getItem('pigi:diagram-theme')).toBe('neutral');

  // Back to following the app, so the rest of this file starts where it did.
  document.documentElement.classList.remove('dark');
  useAppStore.getState().setDiagramTheme('auto');
  await waitFor(() => graphicIn(screen.container).innerHTML === following);
});
