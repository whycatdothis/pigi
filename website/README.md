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
its state as props (`terminalOpen`, `viewModes`, `viewMenuOpen`, `overlayOpen`), so a section is a
window plus a short paragraph. The transcripts live in `src/lib/sessions.ts`; the geometry of a window
(the app's 800px height, the sidebar's 232px, the terminal's 280px) lives in `src/lib/appLayout.ts`.

### What is on the page

Hero, then six feature sections — instant history, fork, session tree (the tree dialog and the help
dialog it opens), view modes, session switcher, terminal — then the three things the app is built on,
then the footer. That is the whole page: no install section, no shortcut table, no FAQ. Nothing that
is not a feature or a claim about one.

Every section is one window, except the session tree's, which is three: the tree action on a message
(one way in), the tree itself, and the explanation the `?` opens. All of them are the app's own window
size — a dialog is 520px wide, not 520px tall, and a shorter window would only be a lie about how the
app looks.

The header's Download button is the same component as the hero's (`variant="compact"`), and both are
real downloads — there is no `#install` anchor to scroll to. Two claims the page makes have no home
here any more, so the button label carries them: it names the architecture, because the only
published DMG is arm64 and "Download for macOS" would hand an Intel reader a file that cannot run.

## Local development

```bash
cd website
npm install
npm run dev        # http://localhost:4321
npm run build      # -> dist/
npm run preview    # serve the built output
npm run check      # astro check + prettier --check
```

### Visual verification

Both scripts drive the built `dist/` in a real browser:

```bash
npm run build
npm run shots         # writes .shots/*.png: full page and per section
npm run verify        # asserts the interactive pieces work (25 checks)
npm run check:drift   # asserts the copied app classes still exist in the app
```

`npm run shots` takes a viewport width as an argument (`npm run shots 900`) so a narrow layout can be
looked at without editing the script. Both scripts answer the GitHub releases API from
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
