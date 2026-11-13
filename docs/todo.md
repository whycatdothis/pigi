# TODO

Follow-ups that were identified but deliberately left out of a branch, because
each one is mechanical or structural enough that mixing it into a feature branch
would make the change hard to review. Delete an entry when it lands; anything
user-visible also adds a line to the CHANGELOG.

## Settings have one writer per process, not one per machine

`createPigiSettingsOwner` reads the file once and then holds the authoritative
copy, which is what makes a change land in order without a revision. A second
app instance is a second owner holding its own copy, so whichever instance writes
last replaces the other's values. Two cheap fixes, and the choice is a product
decision rather than a code one: `app.requestSingleInstanceLock()` (second launch
focuses the first window — also removes the duplicate tray icon and the
`${path}.tmp` name collision between instances), or re-reading the file before
each write and merging onto what is there.

The temp name is `${path}.tmp` for every instance; with the lock it stops
mattering, without it each writer should use its own suffix.

The `pigi` CLI has the same gap: a second instance of the same build serves no
socket, and its sessions' `pigi` calls reach the first instance
(`docs/cli.md` §8). The lock fixes this too.

## Shell environment resolution blocks launch

`initializeShellEnv` (`src/main/processes/shellEnvResolver.ts`) runs
`execFileSync` over every candidate login shell, each with a 5s timeout, plus a
`dscl` call — synchronously, inside `app.whenReady()` and before the window is
created. A slow `.zshrc` (nvm, a corporate prompt, a cold network mount) is a
white screen for as long as the slowest shell takes.

The fix is to resolve with `execFile` instead and have the three spawn paths
that inherit `process.env` wait on it: `createPiAgentProcess` (both the warm
process and a claimed one), `createTerminalProcess` and
`createPackageWorkerProcess`. That means making `PiAgentProcessPool.ensureWarmProcess`
/ `claimWarmProcess` and `startTerminal` async, which is why it is its own
change: a spawn that slips ahead of the resolution silently gives the agent the
launchd PATH (no brew, no nvm) instead of failing loudly.

## Transcript controllers are never evicted

`useTranscript` keeps one controller and one push subscription per session path
(`controllersBySession`, `subscriptionsBySession`) and only drops them on
session close or a failed resume. Keeping a closed tab's transcript warm is
deliberate; with a hundred sessions opened in a day, every one of them keeps its
node text (large tool output included) and processes its background pushes
forever. An LRU over the subscriptions (drop the least recently shown session
that is idle and not the active one) would bound it; check first that reopening
a session re-hydrates from the file, since a dropped controller only has
`getMessages` to come back from.

## Reserve a minimum width for the main area

At 560px and below the right sidebar's always-allowed width wins, leaving the
main area 1px wide and its header unreachable. Cap the sidebar so the main area
keeps roughly 240px, and collapse the right sidebar instead of the main area
when the window cannot fit both. This is pre-existing layout behavior, not
introduced by the workspace tabs.

## Bound the file viewer's DOM by lines, not characters

The viewer now highlights only under 90k characters and 2,500 lines. The same
budget also applies to chat code blocks, which previously had an 80k character
cap and no line gate. For the viewer, the line gate removes the worst case: a
5,000-line dense file falls back to plain, about
15,000 nodes and a 167ms warm render, instead of producing about 65k nodes and
long tasks over 500ms. A 100k dense TSX still measured about 420ms before the
cap. App.tsx (~86k, 2,091 lines) has measured 190ms for one warm task, but
480–640ms end to end, so treat its numbers as order-of-magnitude. The worst
case inside both caps is 2,499 lines / 85,280 characters: about 748ms, 30k
spans and a 389ms longest task. The remaining cost is line/span dominated; the
90k character cap is no longer the binding constraint. 5,000 plain lines still
render every row. Tokenizing only a prefix would leave the rest plain; real
windowing would also have to keep line-range quoting working across the whole
file.

The char cap still creates a cliff: 86k App.tsx highlights while a slightly
larger file falls back to plain. Revisit it with the line budget and a warm
measurement at the boundary.

## Land directory links and anchors in the markdown preview

Relative links open files now, but a link to a directory shows the file-read
error, and `other.md#L10` drops the anchor. Opening a directory means expanding
the file tree; opening a line anchor means carrying a target line into the
viewer.

## Fold the hand-picked type weights into a few composite roles

The size ramp and the 400/500/600 weight rule are documented, but call sites
still combine them by hand (`font-semibold text-caption`). When the same
combination appears a third time, add 2–3 roles — section label, row, page
title — that bundle size, weight, line height and colour, so a change lands in
one place. Do not use `h1–h6` as font-size APIs; they describe document
structure, not visual hierarchy.

## Git tab: degrade instead of failing on huge changes

Two edge cases end in an error instead of a partial view: thousands of
untracked files that are not ignored (each gets an intent-to-add numstat and
the summary can pass the 6s timeout), and a patch larger than the 16MB
`maxBuffer`. Both should show what fits with a notice, as the 5,000-line patch
cap already does.

## Git tab: low-yield git work, measured

On one 170k-file repository a summary is about 2.2s, 1.8s of it `ls-files
--others` walking the tree for untracked files, which only a user-enabled
`core.fsmonitor` plus `core.untrackedCache` would cut (passing them with `-c`
does not help: the cache is only kept by writing the index). Measured and
left alone because the gain is small there:

- Merging the serial `rev-parse` / `symbolic-ref` calls at the start: ~20ms
  per process saved. `commitRange` returning `{ command, args }` would drop the
  `range.slice(0, 1)` splicing in `changedFiles`; do both if touching that code.
- Skipping the patch re-read on a summary refresh when the file did not
  change: ~90ms per refresh (~210ms with an untracked file's index copy). It
  needs the working-tree file's `mtime` and `size` in the summary; the +/-
  counts alone are not enough, since replacing one line keeps them.

## Git tab: a selection's quote check walks every diff line

While text is selected, `QuoteSelectionPopover` calls `formatQuoteText` on
every scroll frame only to learn whether the selection quotes, and the Git
viewer's `diffLinesFromSelection` answers by testing every `[data-diff-line]`
against the range: up to 5,000 rows plus a second body while a patch swaps
in, a millisecond or two per frame. Walking from the start row to the end row
would cost only the selected lines; the popover could also take a cheap
`canQuote` check and format only on click.

## Find scrolls only the outer container

`ContainerFind` brings a match into view by scrolling the viewer itself. A
match inside a code block that scrolls on its own (Files markdown preview) stays
hidden sideways, and one under the sticky line-number gutter counts as visible
because its rect is still inside the container. Fix by walking the scrollable
ancestors between the match and the container, and treating the gutter width as
an inset.

## Replace the template `appId`

`electron-builder.yml` still has `com.electron.app`, which every Electron app
that never changed it shares; `setAppUserModelId('com.pigi')` in
`src/main/index.ts` matches neither. The plan is `pink.pigi`, with no bridge
release: Squirrel.Mac checks an update against the running app's designated
requirement, so every installed macOS copy fails at Restart once and installs
the DMG by hand through the "Download pigi" action on the failure (shipped
first, for exactly this). macOS asks again for folder and notification access
afterwards. Pin `nsis.guid: d8e79033-b579-5adb-9605-820525010f54` so a Windows
build keeps upgrading the old install, and set the AppUserModelID to the same
id. The PATH install (`docs/cli.md` §11) waits for this, both because opening the
app from the launcher goes by bundle id and because it should land in the same
release as the switch rather than move an hour later.

## Add `pigi` to PATH

Parked on `feat/cli-path-install` (`fd5c7cf`), written and checked against a
packaged build: a `/usr/local/bin/pigi` symlink, one `osascript` elevation, the
ownership rules, Settings → Command line and the menu item. It waits for the
`appId` switch above — do it in the same release or right after, not before, so
the first copy anyone can quote outside the app is the one with its final
bundle identity. Merging that branch is then the whole job; it also carries the
`CliInstall*` types, the three IPC channels and `docs/cli.md` §11. Windows NSIS
(`nsis.include` adding `<install>\resources\bin` to HKCU `PATH`) and the Linux
deb `afterInstall` are design only.

## Packages page follow-ups

- Enable or disable a package's single extension, skill, prompt or theme (what
  `pi config` does: package filters and `+path`/`-path` overrides in settings).
  The page lists the resources and their enabled state but cannot change it.
- Catalog search reads the registry from `npm config get registry`; pi's
  `npmCommand` setting (an npm wrapper such as `mise exec … npm`) is ignored
  there, though installs honour it.
- README images are dropped because the CSP loads no remote image. Showing
  them means extending the `package-image://` proxy (which serves only a
  package's `pi.image`) or a scoped `img-src`.
- A timed-out operation kills the package worker, but npm or git started by
  pi's package manager keep running as orphans, and the queue moves on while
  they still write the install folder. Killing the worker's children (or its
  process group) on timeout closes that; it only matters after the 10-minute
  limit.
- The session worker coalesces catalog reloads, so the reload after an
  install can join one that started before it and miss a provider the new
  package adds, until the next reload.
- A package on disk whose version is outside its configured range, or a user
  entry shadowed by a project entry of the same package, lists with no
  resources and the generic "nothing for pi" text instead of saying why.
- `pi remove …` and `pi update …` lines in the field are searched for, not
  run.

## Telemetry: readable renderer stack traces

Renderer `exception` events carry the production bundle's minified frames
(`<app>/out/renderer/assets/index-<hash>.js:1:<column>`), so a renderer error
names a column, not a function. Keeping each release's renderer source maps
(a release asset, not shipped in the app) and mapping a reported frame with
them would resolve it. Main-process frames are unminified and already readable.
