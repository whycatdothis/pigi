import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useRef } from 'react';
import type { TranscriptNode } from '../../state/transcriptController';
import { requireElement } from '../../testing/domQuery';
import UserMessageMiniMap from './UserMessageMiniMap';
// The exit animation and its fill mode are real CSS: load the stylesheet, or
// every computed-style assertion below reads `none`.
import '../../assets/main.css';

const NODES: TranscriptNode[] = [
  { id: 'u1', role: 'user', text: 'First question', sentAt: 1_760_000_000_000 },
  { id: 'u2', role: 'user', text: 'Second question', sentAt: 1_760_000_060_000 },
  { id: 'u3', role: 'user', text: 'Third question', sentAt: 1_760_000_120_000 },
];

const PANEL_SELECTOR = '[role=group][aria-label="Jump to a message"]';

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

/** Opens the list and hands back the panel once the exit can be started. */
async function openThenClose(): Promise<HTMLElement> {
  const screen = await render(<MiniMapHarness onScrollToIndex={vi.fn()} />);
  await userEvent.hover(requireElement<HTMLElement>('[role=navigation]'));

  const panel = await vi.waitFor(() => requireElement<HTMLElement>(PANEL_SELECTOR), {
    timeout: 2000,
  });
  expect(screen.getByRole('group', { name: 'Jump to a message' })).toBeDefined();

  // Leave the minimap: closes after the hover-close delay, then runs the exit.
  await userEvent.hover(document.body);
  await vi.waitFor(
    () => {
      if (!panel.isConnected) throw new Error('panel unmounted before the exit started');
      if (getComputedStyle(panel).animationName !== 'exit') {
        throw new Error('the exit animation has not started yet');
      }
    },
    { timeout: 2000 },
  );
  return panel;
}

/**
 * Closing used to flash: `animate-out` does not fill, so between its last frame
 * (opacity 0) and the unmount driven by `animationend` the panel painted one
 * full frame at its own opacity 1.
 */
test('only the exit holds its last frame', async () => {
  await render(<MiniMapHarness onScrollToIndex={vi.fn()} />);
  await userEvent.hover(requireElement<HTMLElement>('[role=navigation]'));
  const panel = await vi.waitFor(() => requireElement<HTMLElement>(PANEL_SELECTOR), {
    timeout: 2000,
  });

  // `forwards` belongs to the exit alone: on the enter it would freeze a
  // snapshot of the panel's own style and keep the effect alive after it ends.
  expect(getComputedStyle(panel).animationName).toBe('enter');
  expect(getComputedStyle(panel).animationFillMode).toBe('none');
  expect(panel.inert).toBe(false);
});

test('the closing list stays invisible and inert until it unmounts', async () => {
  const closingPanel = await openThenClose();
  const exitAnimation = closingPanel.getAnimations()[0];
  expect(exitAnimation).toBeDefined();
  // Two facts that hold whatever the timing is: the animation ends invisible,
  // and the fill mode keeps that frame after it finishes.
  const effect = exitAnimation.effect;
  expect(effect instanceof KeyframeEffect).toBe(true);
  const lastKeyframe = effect instanceof KeyframeEffect ? effect.getKeyframes().at(-1) : undefined;
  expect(String(lastKeyframe?.opacity)).toBe('0');
  expect(getComputedStyle(closingPanel).animationFillMode).toBe('forwards');

  // A fading panel still sits over the transcript's right edge, so it must not
  // take clicks, keep focusable children, or stay in the accessibility tree.
  expect(closingPanel.inert).toBe(true);
  const box = closingPanel.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  expect(hit === null || !closingPanel.contains(hit)).toBe(true);

  // And it goes away by itself: unmounting on `animationend` is the mechanism,
  // but nothing may depend on that event arriving.
  await vi.waitFor(() => expect(document.querySelector(PANEL_SELECTOR)).toBeNull(), {
    timeout: 3000,
  });
});

/**
 * `animationend` is the only unmount, and it is not the only way an exit can
 * end: a cancelled animation (React re-renders the panel's class mid-exit, the
 * element is hidden) never fires it. Without the fuse the panel would stay
 * mounted at opacity 0, over the transcript, for the rest of the session.
 */
test('a cancelled exit still unmounts the panel', async () => {
  const panel = await openThenClose();
  for (const animation of panel.getAnimations()) animation.cancel();

  await vi.waitFor(() => expect(document.querySelector(PANEL_SELECTOR)).toBeNull(), {
    timeout: 3000,
  });
});
