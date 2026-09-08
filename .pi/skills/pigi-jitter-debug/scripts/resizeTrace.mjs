#!/usr/bin/env node
/**
 * Record a Chromium trace of the renderer for N seconds (drag the window
 * during that time), then print one line per viewport resize step: CSS width,
 * the duration of the main-thread task that applied it, and which viewport
 * breakpoints (if any) that step crossed. Also prints font-update
 * invalidations and full-document layouts, which are the signature of the
 * "layered stylesheet rebuilt on media query change" problem.
 *
 * Usage: node resizeTrace.mjs [seconds=30] [out=/tmp/pigi-resize-trace.json]
 */
import http from 'node:http';
import fs from 'node:fs';

const CDP_PORT = 9222;
const seconds = Number(process.argv[2] || 30);
const outPath = process.argv[3] || '/tmp/pigi-resize-trace.json';
const BREAKPOINTS = [640, 768, 1024, 1280, 1536];
const CATEGORIES =
  '-*,devtools.timeline,disabled-by-default-devtools.timeline,blink,blink.user_timing';

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
const events = [];
let resolveComplete;
const complete = new Promise((resolve) => (resolveComplete = resolve));
socket.addEventListener('message', (messageEvent) => {
  const message = JSON.parse(messageEvent.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  } else if (message.method === 'Tracing.dataCollected') {
    events.push(...message.params.value);
  } else if (message.method === 'Tracing.tracingComplete') {
    resolveComplete();
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
// VisualViewport::setSize reports device pixels.
const devicePixelRatio = (
  await send('Runtime.evaluate', { expression: 'devicePixelRatio', returnByValue: true }, sessionId)
).result.result.value;
await send('Tracing.start', { categories: CATEGORIES, transferMode: 'ReportEvents' }, sessionId);
console.log(`tracing for ${seconds}s, drag the window now...`);
await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
await send('Tracing.end', {}, sessionId);
await complete;
socket.close();
fs.writeFileSync(outPath, JSON.stringify({ traceEvents: events }));

const resizeDispatches = events.filter(
  (event) => event.name === 'EventDispatch' && event.args?.data?.type === 'resize',
);
if (resizeDispatches.length === 0) {
  console.log('no resize events captured');
  process.exit(0);
}
const { pid, tid } = resizeDispatches[0];
const mainThread = events
  .filter((event) => event.pid === pid && event.tid === tid && event.ph === 'X')
  .sort((a, b) => a.ts - b.ts);
const tasks = mainThread.filter((event) => event.name === 'RunTask');
const containingTask = (event) =>
  tasks.find((task) => task.ts <= event.ts && task.ts + task.dur >= event.ts);

let previousWidth = null;
for (const setSize of mainThread.filter((event) => event.name === 'VisualViewport::setSize')) {
  const task = containingTask(setSize);
  const width = Math.round(setSize.args.width / devicePixelRatio);
  const crossed = BREAKPOINTS.filter(
    (breakpoint) => previousWidth !== null && previousWidth < breakpoint !== width < breakpoint,
  );
  const cost = task ? `${Math.round(task.dur / 1000)}ms` : '?';
  console.log(`${width}px  ${cost}${crossed.length ? `  crossed ${crossed.join('/')}` : ''}`);
  previousWidth = width;
}

const fontInvalidations = mainThread.filter(
  (event) => event.name === 'StyleEngine::InvalidateStyleAndLayoutForFontUpdates',
).length;
const fullLayouts = mainThread.filter(
  (event) => event.name === 'Layout' && event.args?.beginData?.dirtyObjects > 500,
);
console.log(
  `\nresize steps: ${resizeDispatches.length}, font-update invalidations: ${fontInvalidations}, full-document layouts: ${fullLayouts.length}` +
    (fullLayouts.length
      ? ` (${fullLayouts.map((layout) => Math.round(layout.dur / 1000) + 'ms').join(', ')})`
      : ''),
);
console.log(`trace saved to ${outPath}`);
