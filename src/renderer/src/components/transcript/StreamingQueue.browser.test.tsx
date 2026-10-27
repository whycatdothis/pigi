import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { requireElement } from '../../testing/domQuery';
import { STREAMING_QUEUE_BAR_STEP_PX } from '../../lib/layoutConstants';
import StreamingQueue from './StreamingQueue';
// The step is measured off a real layout with the app's own stylesheet: jsdom
// cannot apply it, so this can only run in a browser.
import '../../assets/main.css';

/** Each bar after the first is pulled up by this much (`-mt-14`). */
const BAR_OVERLAP_PX = 56;

/**
 * The queue reserves its height from a constant in `layoutConstants`, while the
 * bar itself is sized by its classes. The two drifted once — the bar's old step
 * name became `text-caption`, the line box grew 17 → 20.8px, and nothing failed
 * — so the number is measured against the rendered bar here.
 */
test('the reserved step matches the rendered bar', async () => {
  await render(
    <StreamingQueue
      isStreaming
      queuedSteering={['Steer this']}
      queuedFollowUp={['Then this']}
      onEditQueuedMessage={vi.fn()}
    />,
  );

  const bar = requireElement<HTMLElement>('[data-testid=streaming-queue-bar]');
  const step = bar.getBoundingClientRect().height - BAR_OVERLAP_PX;
  expect(Math.abs(step - STREAMING_QUEUE_BAR_STEP_PX)).toBeLessThan(0.5);
});
