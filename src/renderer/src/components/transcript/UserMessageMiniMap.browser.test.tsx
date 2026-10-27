import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useRef } from 'react';
import type { TranscriptNode } from '../../state/transcriptController';
import UserMessageMiniMap from './UserMessageMiniMap';
// The exit animation and its fill mode are real CSS: load the stylesheet, or
// every computed-style assertion below reads `none`.
import '../../assets/main.css';

const NODES: TranscriptNode[] = [
  { id: 'u1', role: 'user', text: 'First question', sentAt: 1_760_000_000_000 },
  { id: 'u2', role: 'user', text: 'Second question', sentAt: 1_760_000_060_000 },
  { id: 'u3', role: 'user', text: 'Third question', sentAt: 1_760_000_120_000 },
];

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

function requireQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`nothing on the page matches ${selector}`);
  return element;
}

/**
 * Hovering off the list used to flash: `animate-out` does not fill, so between
 * its last frame (opacity 0) and the unmount driven by `animationend` the panel
 * painted one full frame at its own opacity 1. The panel now fills forwards, so
 * it stays invisible from the end of the exit until React removes it. Waiting
 * for the animation's `finished` promise is the deterministic moment to check:
 * with `fill-mode: none` the computed opacity there is already back to 1.
 */
test('the closing list stays invisible until it unmounts', async () => {
  await render(<MiniMapHarness onScrollToIndex={vi.fn()} />);

  const minimap = requireQuery('[role=navigation]');
  await userEvent.hover(minimap);

  const exitingPanel = await vi.waitFor(
    () => requireQuery<HTMLElement>('[role=navigation] > div[id]'),
    { timeout: 2000 },
  );
  const openStyle = getComputedStyle(exitingPanel);
  expect(openStyle.animationName).toBe('enter');

  // Leave the minimap: closes after the hover-close delay, then runs the exit.
  await userEvent.hover(document.body);
  await vi.waitFor(
    () => {
      const panel = document.querySelector<HTMLElement>('[role=navigation] > div[id]');
      if (!panel) throw new Error('panel already unmounted before the exit started');
      if (getComputedStyle(panel).animationName !== 'exit') {
        throw new Error('the exit animation has not started yet');
      }
      return panel;
    },
    { timeout: 2000 },
  );

  const panel = requireQuery<HTMLElement>('[role=navigation] > div[id]');
  const exitAnimation = panel.getAnimations()[0];
  expect(exitAnimation).toBeDefined();
  // The fill mode is what survives the animation; the opacity read below is the
  // symptom the user saw.
  expect(getComputedStyle(panel).animationFillMode).toBe('forwards');
  await exitAnimation.finished;

  // React may already have unmounted the panel by now (the unmount is what the
  // animation was for); if it is still here, it must be at opacity 0, not 1.
  if (panel.isConnected) {
    expect(Number(getComputedStyle(panel).opacity)).toBe(0);
  }
});
