# pigi website

The marketing site for pigi. Static HTML, deployed to Cloudflare Pages.

## What it is

- **Astro 7** — static output, no server, no framework runtime in the browser.
- **Tailwind 4** — via `@tailwindcss/vite`, the same major version the app uses.
- **No client framework.** The whole page is HTML and CSS; `src/scripts/interactions.ts` is the
  only script. `BaseLayout.astro` imports it once for both pages, and every initializer guards on
  its own markup — the changelog has no windows, but it does have the header, the theme toggle and
  the download button.
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

The app paints links, focus rings, the minimap's lit bar, the selected session and search highlights
with an accent the user picks from `src/renderer/src/lib/themeAccents.ts` (eight of them, default
Indigo), and `applyThemeAccent` publishes the choice as `--accent-light` and `--accent-dark` on
`<html>`. `BaseLayout.astro` writes those same two properties the same way, from `src/lib/site.ts`,
and everything that reads `--system-accent` — in a window or on the page — follows, in both themes.

The page's colour is pink, the pig's. The icon (`public/icon-256.png`) is `#f6729b`, but that is a
2.7:1 pink: it can neither carry white text nor read as text on white, so the page uses its hue at
the lightness each job needs. `BRAND_PINK` fills the download button and `BRAND_PINK_INK` (white)
prints on it — 4.8:1, and the same pair in both themes, because a fill that flipped would have to
flip its ink too. Anything that has to read (the eyebrows, the lit minimap bar, the selected session,
the focus ring) uses the accent instead: `SITE_ACCENT_LIGHT`/`SITE_ACCENT_DARK`, the same hue tuned
per theme (4.9:1 on the page, 9.6:1 on the dark page).

The page's surface is that pink too, not a white sheet with a wash at the top: `--page-background` is
the hue at a fifth of a percent of chroma by day, so the foot of a seven-screen page is the same page
as its head. Dark mode needs more than that fifth of a percent — at that lightness the hue drowns in
the surface, and a page that differed from black by that much read as no colour at all — so the dark
surface carries three percent of it (burgundy rather than a tint) and the hero's wash goes to 26%, on
a grid whose hairlines are the accent too. A window keeps the app's own `--background`, which is what
makes it read as a surface _on_ the page rather than a hole in it — and the two
`<meta name="theme-color">` values are sampled from the same pair, so the browser's chrome matches the
page it frames.

None of the app's eight accents is the pig's, which makes this the one colour the page names for
itself; it is also the one thing on the page that is not the app's, together with the download
button's fill — the app's filled variant is neutral `bg-primary`, and this button is the page's own
action rather than a control in a window. Every button inside a window still wears the app's
`BUTTON_FILLED`, unchanged.

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

Hero, then the tour — seven chapters and one window — then the footer. That is the whole page: no install section, no shortcut table, no FAQ. Nothing that is
not a feature or a claim about one.

The hero is the title, the page's own download button, and the window — no subtitle, no badge, no
second button. The download under the title is the primary action, the one a reader who arrives from
a search wants before they read anything, and it is the only one on the page: the header carries the
links and the theme toggle, not a copy of it. Its URL is version-less (`releases/latest/download/`,
see below), so a release published a minute ago is downloadable from a page built a month ago. The
tour opens with the migration claim, because it is the question a pi user arrives with: the window
there holds a `/` in the composer and the command menu open over it, so the skills in the list are
visible as skills — pi's, not pigi's — and `/reload` says in the app's own words what it reads.

The tour is the answer to what this page used to be: seven sections of _a paragraph and a picture of
the app_. Seven of the same shape is seven times the same layout, and the seventh still only says
what the first did — here is the app. So the window is pinned — on the left, the way a
screenshot is read before its caption — and the chapters scroll past it on the right
(`position: sticky`, not a captured wheel): _Your pi, unchanged_, _View modes_, _Instant session
switch_, _Fork_, _Tree_, _Session switcher_, _Terminal_. Only what is inside the window changes, and
the window keeps answering the pointer while it is pinned — the filter menu picks a density, a
minimap bar jumps, the tree's `?` opens the help, a terminal tab activates — so a chapter's last line
is an instruction rather than a caption. `initFeatureStage` only decides which chapter is current:
the last one whose heading crossed a line at 40% of the viewport, one `data-active` write per stack,
with the CSS fading between stills. Nothing is re-rendered and every still stays laid out, which is
what the minimap and the transcript clip measured themselves against when the page loaded.

The order is the order a pi user arrives in: first that their own pi comes through unchanged, then
the three ways through a long session (density, jumping, forking), then the tree the tree action
opens, then every session one line away, then the shell at the bottom of the same window.

Each chapter's heading is its name — _View modes_, _Tree_ — not a sentence, and the sentence that
used to be the headline is the paragraph's first line: a name says what a feature is, and "It is the
pi you already have" only says it again at 30px.

The still is the app's 1200x800 laid out at that size and shrunk in one transform, not a window that
reflowed to the column: `[data-stage-frame]` reserves the box it renders into and
`[data-stage-scaler]` carries the app's own width and the scale. Leaving the scaler at the frame's
width instead lays the window out at a narrower size and _then_ shrinks that, which draws the app at
a width it does not have — and leaves the still sitting short of its column's edge.

Below `lg` there is no room to pin a window beside the words, so the same markup falls back to what
it was: an index row that shows one chapter over one window. `initFeatureStage` decides which
chapters are visible by marking all seven as active where the pinned layout applies, so the CSS keys
off one attribute at both sizes and there is no second breakpoint to keep in step.

Every window is the app's own size — a dialog is 520px wide, not 520px tall, and a shorter window
would only be a lie about how the app looks.

The _View modes_ still opens on **Compact**, the mode most of a real session is read in, with the
menu open over it on the checked item — and the check is in every item, shown by `data-state`, so
choosing a mode moves it. An icon that exists only in the markup of the row that shipped checked
cannot follow a click.

Its panels start at the top and grow downwards: the app's list is a plain scroll container (`pb-8
pt-6`, no `justify-end`), so a short turn sits under the toolbar rather than being pushed down to the
composer.

The sidebar lists three rows in every window — the session that is open, the fork that came off it,
and one older chat. A developer's own sidebar is a column of thirty, but a still is read in a second
and thirty rows say nothing three do not; the fork is the row that cannot go, because it is where the
fork action's result lives. The windows that have to keep their list still take it as a prop
(`Sidebar`'s `sessions`), which is what the instant-switch still does.

That still answers its own chapter. Switching sessions is the claim, and a picture of one session
cannot show it: three sessions are stacked in the same cell and `initSessionCycle` opens the next one
every 1.5s (`AUTO_ADVANCE_MS`), the window's title and the sidebar's selection moving with it. All
three are sessions the reader has already met — the hero's, the tree's, the long one the minimap is
drawn for — and the timer only runs while the chapter is the one on the window, and not at all for a
reader who asked for less motion. The window's first frame is that long session, so the minimap the
chapter is about is the one a reduced-motion reader gets.

The _View modes_ still moves for the same reason: one turn drawn three ways is a claim a single
picture cannot make either, so `initViewModes` opens the next density every 1.5s with the menu open
over the window, and the check visibly moves with it. That is also the row that makes the check's
markup matter — an icon that exists only on the item that shipped checked cannot travel. A reader who
picks a density keeps it: the timer stops for good. Both timers hold while the pointer is over the
window (a still being used is not a still to move) and neither runs under reduced motion.

Minimal keeps the turn folded, and its timer row is a real button, as it is in the app
(`minimalView.tsx`): clicking it opens the same entries the other two panels draw — the thinking, the
read group, the edit — and turns the `size-4` chevron ninety degrees. Drawn as a still with no
details behind the row, Minimal was the one panel that showed less than the app does.

One markup rule the stills have to keep: a tooltip is a **sibling** of its button, never a child. The
tree's tooltip carries the app's round `?`, which is a button itself, and a `<button>` inside a
`<button>` is markup a parser does not accept — it closes the outer one at the inner tag, which
dropped that `?` out of the tooltip and drew it in the toolbar, an icon the app only ever shows while
its tooltip is open.

The download button is a real download — there is no `#install` anchor to scroll to — and its label
names the architecture: the only published DMG is arm64, so "Download for macOS" would hand an Intel
reader a file that cannot run.

The header is the page at the top and a floating strip once the page moves. It has no rule under it
(the line cut a page that has no seam there) and no fill at rest, so the hero's wash runs behind it;
the hero is pulled up under the header and padded back down so that the wash begins at the top of the
page rather than at the header's edge. `initHeaderScroll` sets `data-scrolled` past 4px and the bar
takes the translucent, blurred fill that keeps its links legible over the content passing underneath
— the same idea as the app's floating surfaces (`bg-background/90 backdrop-blur-sm`).

### Search

Nobody searches for "pigi"; they search for what it is. So the title and the description name the
category — `pigi — a pi agent GUI for macOS`, a "sleek pi GUI for macOS" — and the structured data
(`SoftwareApplication` in `BaseLayout.astro`) carries the same phrases as `alternateName`: `pi agent
GUI`, `pi GUI`, `pigi GUI for pi`. The rest of the object is what the page can honestly claim: a
free, arm64 macOS developer application, licensed Apache-2.0, not affiliated with pi's authors.

Only the home page describes the app; the changelog keeps its own title and description, because a
release log is not the thing being searched for.

## Local development

```bash
cd website
npm install        # Node 24 — .node-version, engines and CI all say so
npm run dev        # http://localhost:4321
npm run build      # -> dist/
npm run preview    # serve the built output
npm run check      # astro check + the class drift check + prettier --check
```

### Visual verification

Both scripts drive the built `dist/` in a real browser:

```bash
npm run build
npm run shots         # writes .shots/*.png: full page and per section
npm run verify        # asserts the interactive pieces work, and the phone-width layout (70 checks)
npm run check:drift   # asserts the copied app classes still exist in the app
```

`npm run shots` takes a viewport width as an argument (`npm run shots 390`) so a narrow layout can be
looked at without editing the script. `npm run verify` already opens the page at 390 and 768 to check
the window contract; the screenshots at those widths are how a change to it gets looked at rather than
asserted. Neither script stubs a network call any more: the download button's href is a
`releases/latest/download/` URL that GitHub resolves at click time, so the page itself makes no request
that could be rate-limited or offline.

They import Playwright, which is a devDependency of this site like any other tool — the version is
pinned to the one the app's own browser tests use, so both share a single Chromium download.

All of it runs on every push and pull request: `.github/workflows/ci.yml` has a `website` job that
installs, runs `npm run check`, builds, and runs `npm run verify` in Chromium.

## Deploying to Cloudflare Pages

The site is a Pages project called `pigi` on the account that owns `pigi.pink`, connected to
`whycatdothis/pigi` on GitHub. A push to `main` is a deploy: Cloudflare clones the repository, runs
the build inside `website/`, and publishes `dist/`. There is nothing to run from a laptop.

|                  |                                                                         |
| ---------------- | ----------------------------------------------------------------------- |
| Build            | Triggered by a push to `main`, and by pull requests as a preview deploy |
| Root directory   | `website` — see below                                                   |
| Build command    | `npm run build` (the class drift check, then `astro build`)             |
| Output directory | `dist`                                                                  |
| Node version     | 24 — `NODE_VERSION=24`, matching `website/.node-version` and `engines`  |
| Custom domains   | `pigi.pink` and `www.pigi.pink`, both proxied CNAMEs onto the project   |
| Canonical URL    | `site` in `astro.config.mjs` — `https://pigi.pink`                      |

**The root directory is not optional.** The repository's own `package.json` has a `postinstall` of
`electron-builder install-app-deps`; a build from the repository root would try to rebuild `node-pty`
against Electron in the Pages container and fail. Building from `website/` installs only the site's
dependencies.

**Only two paths trigger a build**: `website/*` and `CHANGELOG.md` (Pages → the project → Settings →
Build watch paths). The `CHANGELOG.md` half is there because `/changelog/` is rendered from that file's
last release section; without it, a release would leave the page describing an older version. An
app-only push — a renderer change, a workflow edit, a dependency bump — builds nothing.

The cost of that: the stills on the page are copies of the app's markup, so an app change that renames
a class the site draws leaves the site drawing the old one until someone touches `website/`. That
someone does not have to remember to look: `npm run build` starts with the drift check, so the next
website push fails and names the class. The site is never _silently_ wrong for longer than that.

**The build checks before it ships.** `npm run build` starts with `scripts/checkAppClassDrift.mjs`,
which compares every class this site copied out of the app against the app's own source. The app is
one directory up in the same clone, so a push that changes a class the site draws fails the deploy
instead of publishing a page that claims to be the app and is not.

Nothing needs a Worker or a Function. There is no server-side code, no redirect table and no
`_routes.json`; `public/_headers` is the whole configuration, and it only tells the browser that
`/_astro/*` — every file named after its own contents — may be cached for a year.

`src/pages/404.astro` is not decoration. Pages answers every unknown path with `index.html` and a 200
when the build has no `404.html` — it assumes a project without one is a single-page app — so the
file is what makes `/robots.txt` the text file and a mistyped address a real 404.

The project was created for direct upload first, from `wrangler pages deploy`. Pages makes that a
one-way choice — such a project cannot be connected to a repository later — so it was deleted and
made again through "Connect to Git", with the domains moved over. If the connection ever has to be
rebuilt, these are the settings above.

### Changing the domain

`site` in `astro.config.mjs` is what the canonical URL, the Open Graph tags and any absolute link in
the page are built from, so it has to be the address a reader arrives at. Move the domain in the
Pages project, then change `site` to match and deploy again — a page that canonicalises itself to an
address it is not served from is a page that tells search engines the wrong thing.

## Analytics

Umami, and only Umami: cookieless, so the site needs no consent banner (`website-id` is in
`src/lib/site.ts`). Two events are tracked, both declared in `src/lib/site.ts` so a rename cannot
leave the dashboard reading half the site under an old label:

- `download-release` — the download button. It carries no version: the href has none, and the release
  that answers it is picked after the click, by GitHub.
- `open-github` — the GitHub links in the header and footer.

Umami binds `data-umami-event` attributes itself, which is why the download click is recorded even
though it starts a navigation away from the page. The theme toggle is deliberately not tracked: it
says nothing about whether a reader is interested in the app.

## The download button

The href is

```
https://github.com/whycatdothis/pigi/releases/latest/download/pigi-arm64.dmg
```

`releases/latest/download/<file>` is GitHub's own shortcut: it answers with the asset of whichever
release is newest **at the moment of the click**. Nothing in the chain has to be kept in sync:

- no rebuild — a release published thirty seconds ago is downloadable from a page built last month;
- no lookup — no request per visitor, so no 60-an-hour anonymous API limit, no extension blocking
  `api.github.com`, no dependency on that host being reachable from where the reader is;
- no script — the link works with JavaScript off, and it lands on a file, not on a page of release
  notes;
- and an already-cached copy of the page is still right, because the string in it never changes.

That only works if every release publishes a file with the same name, which is why the DMG has no
version in it (`dmg.artifactName: ${name}-${arch}.${ext}` in `electron-builder.yml` → `pigi-arm64.dmg`).
The version stays where it is useful: the tag, the release page, `/changelog/`. Histories of earlier
releases keep their own copy under the same name, so old links point at old files, as they should.

The failure mode of the versioned name it replaced is worth keeping in mind, because it is what makes
the version-less one necessary rather than merely tidy: the release workflow uploads its artifacts to a
**draft** release and publishes it last (`gh release edit --draft=false`), and a draft's assets answer
404 to anyone who is not the owner. Built from the version in `package.json` — the other obvious way to
write a static link — the button would therefore be broken for the ten minutes between the version bump
and the publish, and stay broken if the notarisation failed. GitHub only ever redirects to a _published_
release, so the shortcut is immune to that whole class of ordering mistake.

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
