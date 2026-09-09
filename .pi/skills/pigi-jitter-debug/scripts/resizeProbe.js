// In-page probe for window-resize jank. Install with
//   node scripts/cdp.mjs eval "$(cat .pi/skills/pigi-jitter-debug/scripts/resizeProbe.js)"
// then have the user drag the window and read window.__resizeLog.
//
// Records only painted-state signals:
// - layout-shift entries (Chrome computes these at paint time, scroll-compensated):
//   a message row with |dy| > 20 is a visible jump, not a probe artefact
// - long-animation-frame entries >= 30ms with their script / style+layout split:
//   a long frame with scripts=[] and small styleLayout is main-thread time spent
//   outside JS (the synchronous resize path), not app code
// - per-frame window size, rAF gap, and DOM mutations inside the virtual rows
//   (added/removed nodes mean rows remounting; attrs are style churn)
(() => {
  const list = document.querySelector('[data-testid="message-list"]');
  const rows = document.querySelector('[data-testid="message-virtualizer"] > div');
  const log = [];
  const start = performance.now();
  const stamp = (kind, extra) =>
    log.push({ t: Math.round(performance.now() - start), kind, ...extra });
  window.__resizeLog = log;

  const describe = (node) =>
    `${node.tagName}.${String(node.className || '').slice(0, 30)}|${node.dataset?.testid || node.dataset?.itemId || ''}`;

  new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) {
      if (entry.value < 0.01) continue;
      stamp('layout-shift', {
        value: Number(entry.value.toFixed(3)),
        sources: entry.sources?.slice(0, 3).map((source) => {
          const node = source.node;
          if (!node) return '?';
          return `${describe(node)} dy=${Math.round(source.currentRect.y - source.previousRect.y)}`;
        }),
      });
    }
  }).observe({ type: 'layout-shift', buffered: false });

  new PerformanceObserver((entries) => {
    for (const entry of entries.getEntries()) {
      if (entry.duration < 30) continue;
      const end = entry.startTime + entry.duration;
      stamp('long-frame', {
        dur: Math.round(entry.duration),
        styleLayout: Math.round(entry.styleAndLayoutStart ? end - entry.styleAndLayoutStart : 0),
        scripts: entry.scripts
          ?.slice(0, 4)
          .map((script) => `${script.invoker}:${Math.round(script.duration)}`),
      });
    }
  }).observe({ type: 'long-animation-frame', buffered: false });

  let added = 0;
  let removed = 0;
  let attrs = 0;
  if (rows) {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          added += mutation.addedNodes.length;
          removed += mutation.removedNodes.length;
        } else {
          attrs++;
        }
      }
    }).observe(rows, { childList: true, attributes: true, subtree: true });
  }

  let resized = false;
  window.addEventListener('resize', () => {
    resized = true;
  });
  let lastFrame = performance.now();
  const frame = (now) => {
    const gap = Math.round(now - lastFrame);
    lastFrame = now;
    if (resized || added || removed || attrs || gap > 25) {
      const entry = { gap, w: innerWidth, h: innerHeight, resized };
      if (added || removed) {
        entry.added = added;
        entry.removed = removed;
      }
      if (attrs) entry.attrs = attrs;
      if (list) {
        entry.scrollTop = Math.round(list.scrollTop);
        entry.fromBottom = Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
      }
      stamp('frame', entry);
    }
    added = removed = attrs = 0;
    resized = false;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.__resizeSummary = () => {
    const frames = log.filter((entry) => entry.kind === 'frame' && entry.resized);
    const shifts = log.filter((entry) => entry.kind === 'layout-shift');
    const rowJumps = shifts.filter((entry) =>
      entry.sources?.some(
        (source) => /\|node-|\|item-/.test(source) && Math.abs(Number(source.split('dy=')[1])) > 20,
      ),
    );
    const longFrames = log.filter((entry) => entry.kind === 'long-frame');
    return {
      resizeFrames: frames.length,
      maxGap: Math.max(0, ...frames.map((entry) => entry.gap)),
      longFrames: longFrames.length,
      longFrameDurations: longFrames.map((entry) => entry.dur),
      rowJumps: rowJumps.length,
      rowJumpSamples: rowJumps.slice(0, 5),
      rowMutations: frames.filter((entry) => entry.added || entry.removed).length,
    };
  };
  return `resize probe installed list=${!!list} rows=${!!rows}; read window.__resizeSummary() after dragging`;
})();
