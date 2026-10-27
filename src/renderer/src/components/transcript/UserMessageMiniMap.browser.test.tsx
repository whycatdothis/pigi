import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useRef } from 'react';
import type { TranscriptNode } from '../../state/transcriptController';
import { requireElement } from '../../testing/domQuery';
import UserMessageMiniMap from './UserMessageMiniMap';
// The panel's open/close state is real CSS: load the stylesheet, or every
// computed-style assertion below reads the element's own defaults.
import '../../assets/main.css';

const NODES: TranscriptNode[] = [
  { id: 'u1', role: 'user', text: 'First question', sentAt: 1_760_000_000_000 },
  { id: 'u2', role: 'user', text: 'Second question', sentAt: 1_760_000_060_000 },
  { id: 'u3', role: 'user', text: 'Third question', sentAt: 1_760_000_120_000 },
];

const PANEL_SELECTOR = '[role=group][aria-label="Messages"]';

/** The minimap sizes its lines from a scroll container, so it needs a real one. */
function MiniMapHarness({
  onScrollToIndex,
}: {
  onScrollToIndex: (index: number) => void;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative h-[420px] w-[640px]">
      <UserMessageMiniMap
        nodes={NODES}
        containerRef={containerRef}
        activeUserMessageIndex={0}
        onScrollToIndex={onScrollToIndex}
      />
    </div>
  );
}

/** Opens the panel by hover and hands it back once it is fully opaque. */
async function hoverOpen(): Promise<HTMLElement> {
  await render(<MiniMapHarness onScrollToIndex={vi.fn()} />);
  await userEvent.hover(requireElement<HTMLElement>('[role=navigation]'));
  const panel = await vi.waitFor(() => requireElement<HTMLElement>(PANEL_SELECTOR), {
    timeout: 2000,
  });
  // The enter is a transition too; sampling the exit from half-way through it
  // would record a fade *in* and read as the panel coming back.
  await vi.waitFor(() => expect(Number(getComputedStyle(panel).opacity)).toBeCloseTo(1, 2));
  return panel;
}

/**
 * Leaves the minimap and samples the panel's painted opacity every frame until
 * it drops out of the layout. Sampling from the first frame is the point: the
 * flash this replaced was a single frame, so only a per-frame record can say it
 * cannot happen.
 */
async function recordClose(panel: HTMLElement): Promise<{ opacities: number[]; display: string }> {
  await userEvent.hover(document.body);
  const opacities: number[] = [];
  const deadline = performance.now() + 3000;
  while (performance.now() < deadline) {
    const display = getComputedStyle(panel).display;
    if (display === 'none') return { opacities, display };
    opacities.push(Number(getComputedStyle(panel).opacity));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error('the panel never left the layout');
}

test('the panel mounts on first open and fades in through its own transition', async () => {
  await render(<MiniMapHarness onScrollToIndex={vi.fn()} />);
  expect(document.querySelector(PANEL_SELECTOR)).toBeNull();

  await userEvent.hover(requireElement<HTMLElement>('[role=navigation]'));
  const panel = await vi.waitFor(() => requireElement<HTMLElement>(PANEL_SELECTOR), {
    timeout: 2000,
  });

  await vi.waitFor(() => expect(Number(getComputedStyle(panel).opacity)).toBeCloseTo(1, 2));
  expect(getComputedStyle(panel).display).toBe('flex');
  // Opening used to be a keyframe animation. The state is the element's own
  // now, so anything still animating through keyframes is a leftover — and a
  // leftover is what the shared overlay classes bring: they key off `data-open`,
  // which is why this panel's own attribute is `data-panel-open`.
  expect(getComputedStyle(panel).animationName).toBe('none');
  expect(
    panel.getAnimations().filter((animation) => !(animation instanceof CSSTransition)),
  ).toEqual([]);
});

test('closing fades out, then leaves the layout without a visible frame', async () => {
  const panel = await hoverOpen();
  const { opacities, display } = await recordClose(panel);

  expect(display).toBe('none');
  // The panel is never unmounted any more: `display` is what hides it, so the
  // rows are not rebuilt on the next hover.
  expect(panel.isConnected).toBe(true);

  const fading = opacities.filter((opacity) => opacity < 0.99);
  expect(fading.length).toBeGreaterThan(1);
  for (let index = 1; index < fading.length; index++) {
    expect(fading[index]).toBeLessThanOrEqual(fading[index - 1] + 0.02);
  }
  expect(opacities.at(-1)).toBeLessThan(0.05);
});

test('the panel is inert for the fade and takes no space once closed', async () => {
  const panel = await hoverOpen();
  const closing = recordClose(panel);
  await vi.waitFor(() => expect(panel.inert).toBe(true));
  await closing;

  expect(panel.checkVisibility()).toBe(false);
  expect(panel.getBoundingClientRect().height).toBe(0);
});

test('re-opening during the fade brings the same panel back', async () => {
  const panel = await hoverOpen();
  await userEvent.hover(document.body);
  await vi.waitFor(() => expect(panel.dataset.panelOpen).toBe('false'), { timeout: 2000 });

  // Clicking the trigger re-opens at once, inside the fade. Hovering cannot test
  // this: its own 200ms open delay outlives the fade, so the panel legitimately
  // finishes closing and opens again afterwards.
  requireElement<HTMLElement>('[aria-label="Jump to a message"]').click();

  await vi.waitFor(() => expect(Number(getComputedStyle(panel).opacity)).toBeCloseTo(1, 2));
  expect(panel.dataset.panelOpen).toBe('true');
  expect(getComputedStyle(panel).display).toBe('flex');
  expect(panel.inert).toBe(false);
});
