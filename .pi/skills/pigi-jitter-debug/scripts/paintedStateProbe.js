/**
 * Painted-state probe for the message list. Install with:
 *   node scripts/cdp.mjs eval-file .pi/skills/pigi-jitter-debug/scripts/paintedStateProbe.js
 * Install it after the list has mounted for the session under test: it must
 * register after the app's observers to read what paints.
 *
 * ResizeObserver callbacks run in registration order after layout, before
 * paint, so this probe reads the frame the app's pin produced. It resizes a
 * hidden element every frame to get a callback in every frame, not only in
 * frames where the rows grew: a row shrinking or the virtualizer's sizer
 * correcting itself moves content without growing anything.
 *
 * window.__painted gets one {t, d, move} entry per frame:
 *   d    distance in px from the scroll bottom (d > 2 = visibly off-bottom)
 *   move largest downward shift of a row that was on screen in the previous
 *        frame (> 2 while following = the reply jolted down, the "抖" users see;
 *        d stays 0 through it, so d alone cannot catch it)
 * window.__paintedSummary() aggregates; window.__paintedStop() uninstalls.
 * Needs rAF: a hidden window (document.visibilityState) gets none. Run
 *   node scripts/cdp.mjs --main eval '__pigi.BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false)'
 * when the window is behind others.
 */
(() => {
  window.__paintedStop?.();
  const ticker = document.createElement('div');
  ticker.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(ticker);
  const log = (window.__painted = []);
  let previousTops = new Map();
  const ro = new ResizeObserver(() => {
    const list = document.querySelector('[data-testid=message-list]');
    if (!list) return;
    const listTop = list.getBoundingClientRect().top;
    const tops = new Map();
    let move = 0;
    for (const row of list.querySelectorAll('[data-item-id], [data-turn-id]')) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom < listTop || rect.top > listTop + list.clientHeight) continue;
      const id = row.dataset.itemId ?? row.dataset.turnId;
      const top = rect.top - listTop;
      tops.set(id, top);
      if (previousTops.has(id)) move = Math.max(move, top - previousTops.get(id));
    }
    previousTops = tops;
    const d = list.scrollHeight - list.scrollTop - list.clientHeight;
    log.push({
      t: Math.round(performance.now()),
      d: Math.round(d * 10) / 10,
      move: Math.round(move * 10) / 10,
    });
  });
  ro.observe(ticker);
  let frame = 0;
  let tick = 0;
  const loop = () => {
    ticker.style.width = `${(++tick % 2) + 1}px`;
    frame = requestAnimationFrame(loop);
  };
  loop();
  window.__paintedStop = () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    ticker.remove();
  };
  window.__paintedSummary = () => ({
    frames: log.length,
    joltsDown: log.filter((entry) => entry.move > 2).length,
    maxJoltDown: Math.max(0, ...log.map((entry) => entry.move)),
    offBottom: log.filter((entry) => entry.d > 2).length,
    maxD: Math.max(0, ...log.map((entry) => entry.d)),
  });
  return 'painted-state probe installed';
})();
