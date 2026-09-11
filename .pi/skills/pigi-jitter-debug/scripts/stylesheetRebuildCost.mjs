#!/usr/bin/env node
/**
 * Measure what one stylesheet rebuild costs, without resizing anything.
 *
 * Flipping an emulated media feature that appears in the renderer CSS
 * (`prefers-reduced-motion` by default) takes the same Blink path as a
 * viewport-width breakpoint crossing: the sheet's rule set is rebuilt and,
 * because the sheet is layered, every font is invalidated and the whole
 * document re-runs style and layout. The cost shows up as one
 * long-animation-frame right after the flip; this prints the longest frame
 * in the window after each flip. Tens of milliseconds means the trap is live.
 * The window must be visible so the renderer produces frames.
 *
 * Usage: node stylesheetRebuildCost.mjs [feature=prefers-reduced-motion] [value=reduce]
 */
import { connect } from '../../../../scripts/cdpClient.mjs';

const feature = process.argv[2] || 'prefers-reduced-motion';
const value = process.argv[3] || 'reduce';

const session = await connect();

/** Longest animation frame (ms) that started after `since`. */
const LONGEST_FRAME_SINCE = (since) => `new Promise((resolve) => {
  const observer = new PerformanceObserver((list) => {
    observer.disconnect();
    let longest = null;
    for (const entry of list.getEntries()) {
      if (entry.startTime >= ${since} && (!longest || entry.duration > longest.duration)) longest = entry;
    }
    resolve(longest ? Math.round(longest.duration) + 'ms' : 'no frame over 50ms');
  });
  observer.observe({ type: 'long-animation-frame', buffered: true });
  setTimeout(() => { observer.disconnect(); resolve('no frame over 50ms'); }, 200);
})`;

async function flipAndMeasure(nextValue, expectedMatch) {
  const since = await session.evaluate('performance.now()');
  await session.call('Emulation.setEmulatedMedia', {
    features: [{ name: feature, value: nextValue }],
  });
  await waitForMatch(expectedMatch);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return session.evaluate(LONGEST_FRAME_SINCE(since));
}

// The emulation override lands asynchronously; poll matchMedia until it is visible to the page.
async function waitForMatch(expected) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const matches = await session.evaluate(`matchMedia('(${feature}: ${value})').matches`);
    if (matches === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`(${feature}: ${value}) did not become ${expected}; is it in the CSS?`);
}

if ((await session.evaluate('document.visibilityState')) !== 'visible') {
  throw new Error('window is hidden; the renderer produces no frames to measure');
}
const flipCost = await flipAndMeasure(value, true);
const resetCost = await flipAndMeasure('', false);
console.log(`${feature}: ${value} -> ${flipCost}; reset -> ${resetCost}`);
session.close();
