import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { peekDiagram, renderDiagram } from '../../lib/mermaidRenderer';
import { appThemeVariables, resolveColor } from '../../lib/mermaidTheme';
import MarkdownMessage from './markdownMessage';
import MermaidDiagram from './mermaidDiagram';
// The diagram is laid out from the app's own tokens and sized by its CSS: this
// layer measures the real thing, styles included.
import '../../assets/main.css';

const FLOWCHART =
  'flowchart TD\n  A[Start] --> B{Ready?}\n  B -- yes --> C[Ship it]\n  B -- no --> A';
const BROKEN = 'this is not a diagram at all';
/** Long enough that the height cap in the CSS has to bind. */
const TALL_CHART = [
  'flowchart TD',
  ...Array.from({ length: 14 }, (_, index) => `  S${String(index)} --> S${String(index + 1)}`),
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

function graphicIn(container: ParentNode): HTMLImageElement {
  const graphic = container.querySelector<HTMLImageElement>('[data-testid=mermaid-diagram]');
  if (!graphic) throw new Error('no diagram has been drawn');
  return graphic;
}

/** The markup behind the drawing, which is what the image is made of. */
function markupOf(image: HTMLImageElement): string {
  return decodeURIComponent(image.src);
}

test('draws a mermaid block as a diagram', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  const block = screen.getByTestId('mermaid-block').element();

  // Drawing measures text and lays out the graph, so it lands a beat after the
  // first render; until then the block shows the source it was given.
  expect(block.querySelector('[data-testid=mermaid-source]')).not.toBeNull();
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  const drawing = graphicIn(block);
  const box = drawing.getBoundingClientRect();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  // The image really renders: a data URL that mermaid produced wrongly would
  // still be a string on an `<img>`.
  await expect(drawing.decode()).resolves.toBeUndefined();
  expect(markupOf(drawing)).toContain('Start');

  // The drawing is an image of mermaid's markup, so none of that markup is in
  // this document: no mermaid SVG, no ids of its own.
  expect(block.querySelector('svg.flowchart')).toBeNull();
  expect(document.querySelector('[id^=pigi-mermaid]')).toBeNull();

  // Mermaid's diagram is not searchable text: the transcript's own search paints
  // its matches into text nodes, and a drawing is not one.
  expect(drawing.closest('[data-search-ignore]')).not.toBeNull();
});

test('caps a tall diagram without stretching it', async () => {
  const screen = await render(<MermaidDiagram code={TALL_CHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  const drawing = graphicIn(screen.container);
  await drawing.decode();
  // The cap binds: without it the drawing would be taller than the block the
  // transcript gives it. The size is mermaid's own, taken from the viewBox it
  // drew into — an SVG in an image has no intrinsic size to ask for.
  expect(Number(drawing.getAttribute('height'))).toBeGreaterThan(420);
  expect(drawing.getBoundingClientRect().height).toBeLessThanOrEqual(421);
  // And the drawing keeps its own proportions inside that box.
  expect(getComputedStyle(drawing).objectFit).toBe('contain');
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
  expect(markupOf(graphicIn(screen.container))).toContain('A');
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
  // Mermaid draws a diagram of the failure into the document by default, where
  // it would sit outside the transcript and never leave.
  expect(document.querySelector('[id^=pigi-mermaid]')).toBeNull();
  expect(document.querySelector('[id^=dpigi-mermaid]')).toBeNull();
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
  const lightDrawing = markupOf(graphicIn(screen.container));

  document.documentElement.classList.add('dark');
  await waitFor(() => markupOf(graphicIn(screen.container)) !== lightDrawing);
});

test('opens the drawn diagram in a zoom overlay', async () => {
  const screen = await render(<MermaidDiagram code={FLOWCHART} />);
  await expect.element(screen.getByTestId('mermaid-diagram'), { timeout: 3000 }).toBeVisible();

  await userEvent.click(graphicIn(screen.container));
  await waitFor(() => document.querySelector('[data-rmiz-modal]')?.hasAttribute('open') === true);

  // The overlay holds the same drawing, scaled to the window. Dismissing it is
  // the library's own behaviour, shared with the image preview.
  const zoomed = document.querySelector<HTMLImageElement>('[data-rmiz-modal-content] img');
  expect(zoomed).not.toBeNull();
  expect(markupOf(zoomed as HTMLImageElement)).toContain('Start');
});

test('draws a diagram it has already drawn without going near the source again', async () => {
  // What a virtualized row does when it scrolls back into the window: the first
  // frame is the diagram, because the module remembers it.
  const sequence = 'sequenceDiagram\n  Alice->>Bob: ping\n  Bob-->>Alice: pong';
  const first = await renderDiagram(sequence, 'light');
  expect(first.ok).toBe(true);

  const remembered = peekDiagram(sequence, 'light');
  expect(remembered?.svg).toContain('<svg');
  // The theme is part of what is remembered: the same source in the other theme
  // is a different drawing, and not one that has been made yet.
  expect(peekDiagram(sequence, 'dark')).toBeNull();
});

test('reads the app theme for the colours mermaid derives shades from', async () => {
  // The app's tokens are `oklch()` and `color-mix()`; mermaid derives lighter
  // and darker shades from whatever it is handed, which needs plain sRGB.
  expect(resolveColor('oklch(0.55 0.2 277.1)')).toMatch(/^rgb\(/);
  expect(resolveColor('color-mix(in srgb, rgb(255 0 0) 50%, white)')).toMatch(/^rgb\(/);
  expect(resolveColor('not-a-colour')).toBeNull();

  const light = appThemeVariables();
  expect(light.primaryColor).toMatch(/^rgb\(/);
  expect(light.background).toMatch(/^rgb\(/);

  document.documentElement.classList.add('dark');
  const dark = appThemeVariables();
  expect(dark.background).not.toBe(light.background);
  expect(dark.textColor).not.toBe(light.textColor);
});
