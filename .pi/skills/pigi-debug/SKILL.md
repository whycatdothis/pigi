---
name: pigi-debug
description: Start dev server, debug via CDP, take screenshots. Use when starting the app, debugging UI, running smoke checks, or needing to inspect renderer/main-process state.
---

# pigi Debug

## Start Dev

Kill existing Electron processes and start fresh. **Stop here** — do NOT wait or verify unless asked.

```bash
pkill -9 -f Electron || true; nohup npm run dev > /tmp/pigi-dev.log 2>&1 &
```

Dev exposes renderer CDP on 9222 and the main-process Node inspector on 9229
(`--inspect` in the `dev` script). Verify only when asked, ~5s after start:

```bash
node scripts/cdp.mjs eval 'document.body.innerText.includes("Open project") ? "ready" : "not ready"'
```

## CDP Commands

`node scripts/cdp.mjs` with no args prints full usage.

```bash
node scripts/cdp.mjs list                          # targets on 9222 and 9229
node scripts/cdp.mjs eval '<js>'                   # renderer; Map/Set/DOM nodes print readably, exceptions with location
node scripts/cdp.mjs --main eval 'process.pid'     # main process
node scripts/cdp.mjs eval-file probe.js            # evaluate a file's contents
node scripts/cdp.mjs state [--main]                # __pigi.snapshot(): sessions, transcript, layout flags / windows, process pool
node scripts/cdp.mjs errors                        # buffered + live console errors/warnings/uncaught (1s window)
node scripts/cdp.mjs console 5 --all               # every console level for 5s
node scripts/cdp.mjs capture /tmp/pigi.png         # screenshot (alias: screenshot)
node scripts/cdp.mjs capture /tmp/r.png '{"x":40,"y":60,"width":800,"height":260}'   # clip, 2x scale
node scripts/cdp.mjs ax [path]                     # accessibility tree, "role name" per line
node scripts/cdp.mjs snapshot                      # document.body.innerText
```

Interaction uses real input events, so React handlers and focus behave like a user:

```bash
node scripts/cdp.mjs click @send-button            # @foo = [data-testid="foo"]
node scripts/cdp.mjs click 'button[aria-label=Settings]'
node scripts/cdp.mjs click 'text=New chat'         # exact visible text
node scripts/cdp.mjs type 'draft text'             # into chat textarea, does NOT submit
node scripts/cdp.mjs type 'x' --into 'input[type=search]'
node scripts/cdp.mjs send 'hello'                  # type into chat + Enter
node scripts/cdp.mjs press Meta+k                  # Enter, Escape, Shift+Enter, Meta+Shift+p, ArrowDown ...
node scripts/cdp.mjs scroll @message-list bottom   # top | bottom | <px>
node scripts/cdp.mjs wait @assistant-message 15000 # exit 1 on timeout
```

`--target <url|title|index>` picks a renderer window when several exist.

Multi-step flows: do not chain many shell calls. Write a throwaway `.mjs` that
imports `scripts/cdpClient.mjs` (`connect`, `click`, `press`, `typeInto`,
`session.evaluate`, `session.call`, `session.onEvent`) and runs on one
connection, so event subscriptions survive across steps.

## App State Handles (dev only)

Renderer `window.__pigi` (`src/renderer/src/lib/debugHandle.ts`):

```js
window.__pigi.snapshot(); // what `state` prints
window.__pigi.appStore.getState(); // zustand store; Maps print as {"[Map]": {...}}
window.__pigi.appStore.getState().setActiveSession(p); // drive store actions directly
window.__pigi.transcript().state.nodes.at(-1); // active session transcript controller
window.__pigi.transcript(sessionPath); // any loaded session
```

Main `globalThis.__pigi` (`src/main/debugConfig.ts`): `app`, `BrowserWindow`, `ipcMain`, `snapshot()`.

```bash
node scripts/cdp.mjs --main eval '__pigi.BrowserWindow.getAllWindows()[0].setSize(900, 700)'
node scripts/cdp.mjs --main eval '__pigi.snapshot().piAgent'
```

## Test IDs

For `click @id` / `wait @id` / `scroll @id` (grep `data-testid` in `src/renderer` for the current list):
`app-shell`, `sidebar`, `message-list`, `message-virtualizer`, `user-message`, `assistant-message`,
`system-message`, `command-message`, `skill-message`, `chat-input`, `chat-textarea`, `send-button`,
`abort-button`, `tool-block-<toolCallId>`, `minimal-*` (minimal view).
Prefer adding a `data-testid` over text matching when a flow needs a new hook.

## Useful Eval Snippets

```js
// Scroll state of the message list
(() => { const el = document.querySelector('[data-testid="message-list"]');
  return el && { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }; })()

// Mounted tool blocks (DOM nodes print as [div#id.cls @testid])
[...document.querySelectorAll('[data-testid^=tool-block]')]

// Leaf elements containing text
[...document.querySelectorAll('*')].filter(el => el.children.length === 0 && el.textContent?.includes('SEARCH')).slice(0, 10)
```

## Production Build

Some problems only show in the production bundle (Tailwind's dev plugin keeps
stale class candidates; minification and chunking differ).

```bash
pkill -9 -f Electron || true; nohup npm run start -- -- --inspect=9229 > /tmp/pigi-preview.log 2>&1 &
```

`electron-vite preview` is unpackaged, so `is.dev` stays true in main: 9222 and
`--main` work, but renderer `window.__pigi` is absent (`import.meta.env.DEV` is
false) — use DOM/`ax` for state. For a packaged `.app` with CDP and auto-opened
DevTools: `PIGI_DEBUG_PANEL=1 npm run build:mac:dev`.

## Restart Required

HMR covers UI components. Changes under `src/main`, `src/preload`, and
`transcriptController.ts` need a full restart.

## Smoke Check

```bash
node scripts/cdp.mjs errors
node scripts/cdp.mjs state
node scripts/cdp.mjs capture /tmp/pigi-smoke.png
```
