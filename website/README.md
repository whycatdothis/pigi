# pigi website

The marketing site for pigi. Static HTML, deployed to Cloudflare Pages.

## What it is

- **Astro 7** — static output, no server, no framework runtime in the browser.
- **Tailwind 4** — via `@tailwindcss/vite`, the same major version the app uses.
- **No client framework.** The whole page is HTML and CSS; `src/scripts/interactions.ts` is the
  only script, and it is about 9 KB.
- **Light and dark.** Both come from the app's own token sets — `.dark` here is the app's `.dark`
  block, and the terminal swaps from Atom One Light to Atom One Dark the way it does there.
- **No screenshots.** Every piece of UI on the page — the window, the transcript, the tool cards,
  the session tree, the terminal — is markup, drawn with the app's own design tokens. See
  "Keeping it honest" below.

## How the page is built

The window is a component (`src/components/app/AppWindow.astro`), and **every feature is shown
inside a full one of them** rather than as a cropped fragment, because the app's layout is what makes
a feature legible: the terminal is only "the terminal" because it takes the bottom of the chat column
with the transcript above it, the tree is only a dialog because the window behind it dims, and the
view-mode menu only means something hanging off the toolbar button that opens it.

Each window is self-contained — sidebar, toolbar, transcript, optional panel and overlay — and takes
its state as props (`terminalOpen`, `viewModes`, `viewMenuOpen`, `overlayOpen`, `slashMenuOpen`), so
a section is a window plus a short paragraph. The transcripts live in `src/lib/sessions.ts`; the
geometry of a window (the app's 800px height, the sidebar's 244px, the terminal's 280px) lives in
`src/lib/appLayout.ts`.

### The accent

The app ships a set of accents (`src/renderer/src/lib/themeAccents.ts`, default Indigo) and paints
links, focus rings, the minimap's lit bar, the selected session and search highlights with whichever
one is chosen. `BaseLayout.astro` publishes one of that same set on `<html>`, the way the app's
`applyThemeAccent` does — both `--accent-light` and `--accent-dark`, so the page and every window on
it follow the theme — and picks **Rose** (`SITE_ACCENT_ID` in `src/lib/site.ts`), because the icon is
a pink pig and the page has one colour. Nothing on the page names a colour of its own; everything
that is tinted reads `--system-accent`.

The one thing that is not the app's is the download button's fill: the app's filled variant is neutral
`bg-primary`, and this button is the page's own action rather than a control in a window, so it wears
the accent (`BUTTON_BRAND_FILLED` in `src/lib/appUi.ts`). Every button inside a window still wears the
app's `BUTTON_FILLED`, unchanged.

A still shows its session the way the app shows one: a session taller than the viewport is at its
newest message, so the still is clipped at the top edge by exactly what the app would be scrolled —
no floating column, no bottom-aligned flexbox, no invented padding (`initTranscriptClips` writes
`scrollTop` on a clipped box). A session shorter than the viewport sits at the top with its two insets,
which is why each still's session is written long enough to overflow: a picture of a conversation is
the app in use, not the app just opened.

### Narrow viewports

A window is always a window the app can actually be. It is fluid from the app's minimum width
(`WINDOW_MIN_WIDTH_PX`, 680, from `createMainWindow.ts`) up to its default 1200, and the page's
container is 1248 wide so that a desktop gets the app at its true 1200x800. Below 680 — a phone —
`AppWindow.astro` draws the window on a fixed 680px canvas and `initWindowFits` in
`src/scripts/interactions.ts` scales that canvas to the room available.

Scaling instead of reflowing is the whole point. A 1200px window reflowed into 390px is not a small
window: it is a layout the app has no such thing as, with the sidebar dropped and every dialog cut to
a ragged truncation — and the sidebar is where the sessions and the fork lineage live, which is half
of what the page is showing. Scaled, a phone gets the app complete: sidebar, toolbar, transcript,
dialogs and terminal, at about half size, with the copy around it still at reading size.

Everything inside a window is therefore measured, not assumed. The minimap's bars are the clearest
case: their width comes from the room between the transcript's column and the window edge
(`src/lib/minimapGeometry.ts`, ported from `UserMessageMiniMap.tsx`), so a narrow window narrows the
strip rather than letting it lie over the text.

### What is on the page

Hero, then seven feature sections — your pi, instant history, fork, session tree (the tree dialog and
the help dialog it opens), view modes, session switcher, terminal — then the three things the app is
built on, then the footer. That is the whole page: no install section, no shortcut table, no FAQ.
Nothing that is not a feature or a claim about one.

The hero is the title and the window; nothing else, no badge and no second button. The first section
is the migration claim, because it is the question a pi user arrives with: the window there holds a
`/` in the composer and the command menu open over it, so the skills in the list are visible as
skills — pi's, not pigi's — and `/reload` says in the app's own words what it reads.

Every section is one window, except the session tree's, which is three: the tree action on a message
(one way in), the tree itself, and the explanation the `?` opens. All of them are the app's own window
size — a dialog is 520px wide, not 520px tall, and a shorter window would only be a lie about how the
app looks.

The header's Download button is the page's only one, and it is a real download — there is no
`#install` anchor to scroll to. Two claims the page makes have no home here any more, so the button
label carries them: it names the architecture, because the only published DMG is arm64 and "Download
for macOS" would hand an Intel reader a file that cannot run.

## Local development

```bash
cd website
npm install
npm run dev        # http://localhost:4321
npm run dev:restart # replace a running dev server: a stale module graph looks like a broken import
npm run build      # -> dist/
npm run preview    # serve the built output
npm run check      # astro check + prettier --check
```

### Visual verification

`shots` and `verify-interactions` drive the built `dist/` in a real browser;
`verify-dev` asks a dev server the same questions:

```bash
npm run build
npm run shots         # writes .shots/*.png: full page and per section
npm run verify        # both of the checks below, in order
npm run verify:dev    # dev-server render checks only (4 checks)
npm run check:drift   # asserts the copied app classes still exist in the app
```

`npm run verify` is `verify-interactions.mjs` (the interactive pieces work, and
the phone-width layout holds: 32 checks) followed by `verify-dev.mjs`, which is
the one that has to exist because **dev is a different pipeline from the build**.
Rollup resolves `dist/` from nothing; Vite serves components over SSR and keeps a
module graph across edits, watching the filesystem for new ones. When a component
is added or renamed while a dev server is running, that graph can keep a path that
no longer exists: the page answers 500 `FailedToLoadModuleSSR` while `astro check`,
`astro build` and every screenshot of `dist/` pass, because the code is fine and
only that process is holding the old graph.

So `verify-dev` fetches `/` and `/changelog` twice: once from the dev server that
is already running (its URL is in `.astro/dev.json` — this is the pass that catches
the stale graph, since the graph lives in that process) and once from a server it
starts itself, on its own port and with `--ignore-lock`, so it neither needs nor
disturbs the one you are working in. Both passes want a 200, no Astro error
payload, and an `<h1>`. When one fails it prints the remedy: `npm run dev:restart`
(`astro dev --force`), which replaces a running server instead of refusing to
start beside it.

`npm run shots` takes a viewport width as an argument (`npm run shots 390`) so a narrow layout can be
looked at without editing the script. `npm run verify` already opens the page at 390 and 768 to check
the window contract; the screenshots at those widths are how a change to it gets looked at rather than
asserted. Both scripts answer the GitHub releases API from
`scripts/releaseFixture.mjs` rather than the network: an unauthenticated call is limited to 60 an hour,
and a run that trips the limit would report the download fallback and look like a broken button.

They import Playwright, which they resolve from the **repository root's** `node_modules` — the app
already depends on it for its browser test layer, so the site does not install a second copy. A
clone of `website/` on its own will need `npm i -D playwright` first.

## Deploying to Cloudflare Pages

Connect the GitHub repository and set:

| Setting                | Value                 |
| ---------------------- | --------------------- |
| Production branch      | `main`                |
| Root directory         | `website`             |
| Build command          | `npm run build`       |
| Build output directory | `dist`                |
| Environment variable   | `NODE_VERSION` = `22` |

**The root directory is not optional.** The repository's own `package.json` has a `postinstall` of
`electron-builder install-app-deps`; a build from the repository root would try to rebuild `node-pty`
against Electron in the Pages container and fail. Building from `website/` installs only the site's
dependencies. `website/.node-version` pins Node for the same reason — Astro 7 needs 22.22 or newer.

Nothing needs a Worker or a Function. There is no server-side code, no redirect table and no `_routes.json`.

### Changing the domain

`site` in `astro.config.mjs` is what the canonical URL and the Open Graph tags are built from. It is
currently `https://pigi.pages.dev`; point it at the custom domain once one is attached.

## Analytics

Umami, and only Umami: cookieless, so the site needs no consent banner (`website-id` is in
`src/lib/site.ts`). Two events are tracked, both declared in `src/lib/site.ts` so a rename cannot
leave the dashboard reading half the site under an old label:

- `download-release` — the download button, with `version` and `asset` attached as event data. The
  values are written onto the element after the newest release is resolved, so the event records the
  file that was actually served.
- `open-github` — the GitHub links in the header and footer.

Umami binds `data-umami-event` attributes itself, which is why the download click is recorded even
though it starts a navigation away from the page. The theme toggle is deliberately not tracked: it
says nothing about whether a reader is interested in the app.

## The download button

The markup ships `https://github.com/whycatdothis/pigi/releases/latest`, which always works. On load,
the script asks the GitHub API for the newest release, finds the arm64 DMG, and rewrites the link to
the file itself — one click instead of a page of release notes. The result is cached in
`sessionStorage` for ten minutes.

Every failure path leaves the fallback in place: rate limit (60 requests an hour per IP,
unauthenticated), offline, or the API changing shape. The button never depends on the request
succeeding.

Nothing about the file is printed next to the button — no version, no size, no architecture — only
what the label says out loud. The version can be served without a rebuild, the size is a curiosity,
and the architecture is the one part a reader needs before clicking.

## Keeping it honest

Four rules make the page worth its claims, and all of them need a hand when things change:

1. **Numbers are imported, not repeated.** The sidebar's width, the terminal's height and the
   transcript's column come from `src/renderer/src/lib/layoutConstants.ts`, and the tree's rows, rails
   and elbows from `sessionTreeGeometry.ts`. Both files have no imports of their own, so this site
   imports them as they are — change `SIDEBAR_DEFAULT_WIDTH` in the app and this page is built with the
   new width. The one number repeated by hand is the window's size, which lives in the main process
   beside Electron; it says so where it is defined.
2. **The app's component classes are copied, not reinvented** (`src/lib/appUi.ts`). The app's
   `components/ui/*.tsx` files are shadcn components, and almost all of what they are is a string of
   Tailwind classes. Those strings are the app's interface, so they are copied verbatim with the file
   they came from, and where the app composes one at a call site the composition is what is copied.
   `npm run check:drift` fails when a copied class no longer exists in the app, so drift turns into a
   failing check instead of a page that quietly stops matching it.
3. **Design tokens are the app's, from one file.** `src/styles/global.css` imports
   `src/shared/designTokens.css`, which is the app's `@theme inline` / `:root` / `.dark` and is imported
   by the app's `assets/main.css` too — one file, two consumers, so a colour or a radius cannot drift.
   The terminal's palette is imported from `components/terminal/terminalTheme.css` for the same reason.
   What the site declares itself is named for the page (`--page-*`, `--window-*`) and nothing else.
4. **Copy that asserts something about the app should be checkable in the app's source.** If a claim
   cannot be pointed at a file, it should not be on the page. Where an interaction stops short of the
   app — the palette closes instead of switching sessions, because the session behind it is a still —
   the component says so in a comment rather than papering over it.
