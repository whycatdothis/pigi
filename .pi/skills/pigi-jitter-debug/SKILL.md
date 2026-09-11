---
name: pigi-jitter-debug
description: Measure and debug visible jitter / vibration / flicker in the renderer at the true paint level (scroll pinning, auto-scroll follow, animation stability, window-resize jank). Use when the user reports scrolling/animated UI "抖", "抖动", "跳", "闪烁", "jitter", "vibration", or "flicker" — especially during fast streaming. Builds on pigi-debug for the CDP setup.
---

# pigi Jitter Debug

Measuring what the user actually sees is the hard part: most JS sampling points
do NOT observe the painted frame. Design rationale for the message-list bottom
follow lives in `docs/architecture.md`; this skill is about measuring.

## Frame order: who runs when

1. Tasks (IPC handlers, React commits scheduled from them, timers)
2. `requestAnimationFrame` callbacks
3. Style recalc + layout
4. ResizeObserver callbacks ← last JS point before paint
5. Paint

Consequences:

- A `useLayoutEffect` keyed on virtualizer state is one frame late for content
  growth: the streaming commit grows row DOM immediately, but the virtualizer
  learns the new size from its own ResizeObserver, so a pin keyed on
  `totalSize` runs in a re-render after the growth frame already painted
  unpinned. The fix runs the pin inside a ResizeObserver on the rows wrapper
  (step 4, same frame as the growth).
- TanStack Virtual's `shouldAdjustScrollPositionOnItemSizeChange` also runs in
  step 4 but targets its own gapless coordinate model (row gaps are CSS
  margins, invisible to measurements), so it never lands on the true bottom.
  Keep it `() => false` when pinning to the real DOM `scrollHeight`.

## Trap 1: rAF probes read pre-render state

rAF runs at step 2, pins at step 4. A rAF loop sampling
`scrollHeight - scrollTop - clientHeight` records the transient before the pin
of the same frame and oscillates on BOTH broken and fixed builds. Useless for
verdicts.

## Trap 2: `Page.captureScreenshot` perturbs timing

Each capture forces a fresh BeginFrame, giving post-paint tasks (React
re-render + late pin) time to finish before the next shot, so every capture
looks pinned even on a build that vibrates at vsync rate. `Page.startScreencast`
sends one frame and goes quiet in this Electron setup. Screenshots can prove
jitter (zigzag) but never its absence.

## The reliable method: painted-state ResizeObserver probe

RO callbacks run in registration order within step 4. A probe observer
registered after the app's own (created at mount) runs after the app's pin, and
nothing scroll-relevant runs between step 4 and paint, so what it reads is what
paints.

```bash
node scripts/cdp.mjs eval-file .pi/skills/pigi-jitter-debug/scripts/paintedStateProbe.js
```

Observes the rows wrapper; on every content resize records
`d = scrollHeight - scrollTop - clientHeight` into `window.__painted`. While
pinned and streaming: `d > 2` = frame painted off-bottom (visible jump);
`|d| <= 0.5` = subpixel rounding, fine. For another target adapt the two
selectors at the top of the probe.

```bash
node scripts/cdp.mjs eval '(() => { const p = window.__painted; const bad = p.filter(e => e.d > 2);
  return { total: p.length, paintedUnpinned: bad.length, max: Math.max(...p.map(e => e.d)), sample: p.slice(10, 30) }; })()'
```

### Standard repro (fast streaming)

1. Start dev per pigi-debug. Open a project, new chat, pick a fast model (DeepSeek V4 Flash).
2. Install the probe.
3. Send a long pure-text prompt. Markdown collapses single newlines, so ask for
   a blank line between lines so every delta grows its own block:
   `不要用任何工具，直接输出：写一首 400 行的长诗，每行以行号开头，每两行之间空一行（markdown 段落），主题是 <topic>，不要输出任何其他解释文字。`
4. Wait for completion, read `window.__painted`.

Baseline (message-list pin fix, 2026-07): broken build 82/88 samples ~22.5px
off; fixed build 0/87, max 0.5px.

### Always run a control

Probe trust comes from discrimination: `git stash` the fix, restart dev (HMR
does not re-run unchanged-signature effects), confirm the probe flags it, `git
stash pop`, confirm it passes.

## Window resize jank (native drag)

The drag is owned by macOS/Electron; the app only sees `resize` events. Do NOT
drive it with CGEvent/AppleScript while the user works: install the probe, ask
the user to drag, read the log.

1. `node scripts/cdp.mjs eval-file .pi/skills/pigi-jitter-debug/scripts/resizeProbe.js`,
   user drags, then `node scripts/cdp.mjs eval 'window.__resizeSummary()'`.
   - `rowJumps > 0`: rows moved > 20px in a painted frame (layout-shift entries
     are paint-time and scroll-compensated, so unlike rAF they cannot be fooled).
   - `longFrames` with `scripts: []` and small `styleLayout`: main-thread time
     outside app JS. Do not go optimize React; get a trace.
   - `rowMutations > 0`: rows remounting, an app bug.
2. `node .pi/skills/pigi-jitter-debug/scripts/resizeTrace.mjs 60`, user drags.
   Prints one line per viewport step: CSS width, task cost, breakpoints
   crossed. ~1ms steps with 55-80ms ones only on breakpoints = the
   stylesheet-rebuild trap. Expensive steps everywhere = genuine reflow cost.
3. `node .pi/skills/pigi-jitter-debug/scripts/stylesheetRebuildCost.mjs`
   reproduces one rebuild without resizing (flips an emulated
   `prefers-reduced-motion` present in the CSS) and prints the long frame. Use
   it to check a CSS change without another drag. Window must be visible.

Stylesheet-rebuild trap (root cause of the 2026-09 resize jank): when a
viewport-width media query result changes, Blink rebuilds that sheet's rule
set. Tailwind v4 output contains `@layer`, and `StyleEngine::ApplyRuleSetChanges`
treats any layered change as `kRuleSetFlagsAll`: font face cache rebuilt, every
font invalidated (`InvalidateStyleAndLayoutForFontUpdates` in the trace), full
document style + layout with text reshaping, 60-80ms per crossing whether or
not the query matches anything. Resize events coalesce into 300px steps, rows
jump. Fix: no width media queries in renderer CSS (AGENTS.md; enforced by ESLint
and `scripts/checkCssMediaQueries.mjs`). Verify with the production build
(pigi-debug): the Tailwind dev plugin keeps stale class candidates until restart.

## Secondary: frame shift analysis

For per-frame content movement (smoothness rather than pinned-ness):
`scripts/shotLoop.mjs <seconds> <dir>` captures ~6-8fps JPEGs, `scripts/shiftMatch.mjs`
template-matches a viewport strip between frames. Monotonic cumulative shift =
no vibration; ±line-height zigzag = vibration. Trap 2 applies: monotonic proves
nothing, zigzag proves presence.

```bash
node .pi/skills/pigi-jitter-debug/scripts/shotLoop.mjs 15 /tmp/shots
mkdir -p /tmp/shots-bmp; for f in /tmp/shots/shot-*.jpg; do
  sips -s format bmp -Z 640 "$f" --out "/tmp/shots-bmp/$(basename "$f" .jpg | sed 's/shot-//').bmp" > /dev/null; done
node .pi/skills/pigi-jitter-debug/scripts/shiftMatch.mjs /tmp/shots-bmp <count> [rectJson]
```

`scripts/frameServer.mjs <dir>` serves frames with CORS for in-page canvas analysis.

## Writing new probes

In-page probes are plain `.js` for `eval-file`; return a short install
confirmation and park results on `window.__*`. Node-side tools import
`scripts/cdpClient.mjs` (`connect`, `session.call/evaluate/onEvent`). Tracing
must run on the page session, not the browser endpoint; `connect()` already
attaches there (see `resizeTrace.mjs`).
