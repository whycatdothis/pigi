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
import http from 'node:http';

const CDP_PORT = 9222;
const feature = process.argv[2] || 'prefers-reduced-motion';
const value = process.argv[3] || 'reduce';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => resolve(JSON.parse(data)));
      })
      .on('error', reject);
  });
}

const version = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/version`);
const targets = await httpGet(`http://127.0.0.1:${CDP_PORT}/json/list`);
const page = targets.find(
  (target) => target.type === 'page' && !target.url.startsWith('devtools://'),
);
if (!page) {
  throw new Error('No page target found');
}
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (messageEvent) => {
  const message = JSON.parse(messageEvent.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
const attach = await send('Target.attachToTarget', { targetId: page.id, flatten: true });
const sessionId = attach.result.sessionId;

async function evaluate(expression) {
  const response = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  return response.result.result.value;
}

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
  const since = await evaluate('performance.now()');
  await send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: feature, value: nextValue }] },
    sessionId,
  );
  await waitForMatch(expectedMatch);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return evaluate(LONGEST_FRAME_SINCE(since));
}

// The emulation override lands asynchronously; poll matchMedia until it is visible to the page.
async function waitForMatch(expected) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await send(
      'Runtime.evaluate',
      { expression: `matchMedia('(${feature}: ${value})').matches`, returnByValue: true },
      sessionId,
    );
    if (response.result.result.value === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`(${feature}: ${value}) did not become ${expected}; is it in the CSS?`);
}

if ((await evaluate('document.visibilityState')) !== 'visible') {
  throw new Error('window is hidden; the renderer produces no frames to measure');
}
const flipCost = await flipAndMeasure(value, true);
const resetCost = await flipAndMeasure('', false);
console.log(`${feature}: ${value} -> ${flipCost}; reset -> ${resetCost}`);
socket.close();
