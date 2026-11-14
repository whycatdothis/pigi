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

## Collapse the right sidebar when the window cannot fit both

The width cap landed (the main area keeps roughly 240px next to the right
sidebar's always-allowed width). The remaining half of the old entry: when even
the capped sidebar does not fit, collapse the right sidebar instead of the main
area — a behavior change that needs a restore story (when it comes back), which
is why it is its own change.

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

## Land directory links in the markdown preview

Relative file links open now, and a line anchor (`other.md#L10`) lands at its
line. A link to a directory still shows the file-read error. Opening one means
expanding the file tree: the resolver only returns a path, and the tree's
expansion state is private to `FileTreeSidebar` (lazy-loaded per directory), so
it needs a directory-kind check and an expand API.

## Fold the hand-picked type weights into a few composite roles

The size ramp and the 400/500/600 weight rule are documented, but call sites
still combine them by hand (`font-semibold text-caption`). When the same
combination appears a third time, add 2–3 roles — section label, row, page
title — that bundle size, weight, line height and colour, so a change lands in
one place. Do not use `h1–h6` as font-size APIs; they describe document
structure, not visual hierarchy. A count found several combinations at three
uses already, but each differed in colour, line height or role (most
`font-normal` uses reset weight inside a semibold parent) — the trigger is a
literally identical combination, not a nominal third use.

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

## Find scrolls only the outer container

`ContainerFind` brings a match into view by scrolling the viewer itself. A
match inside a code block that scrolls on its own (Files markdown preview) stays
hidden sideways, and one under the sticky line-number gutter counts as visible
because its rect is still inside the container. Fix by walking the scrollable
ancestors between the match and the container, and treating the gutter width as
an inset.

## Packages page follow-ups

Roughly in value-per-cost order:

- Enable or disable a package's single extension, skill, prompt or theme (what
  `pi config` does: package filters and `+path`/`-path` overrides in settings).
  The page lists the resources and their enabled state but cannot change it.
- Catalog search reads the registry from `npm config get registry`; pi's
  `npmCommand` setting (an npm wrapper such as `mise exec … npm`) is ignored
  there, though installs honour it.
- A package on disk whose version is outside its configured range, or a user
  entry shadowed by a project entry of the same package, lists with no
  resources and the generic "nothing for pi" text instead of saying why.

Dropped after review: README images (mostly badges, and showing them needs a
CSP or proxy extension) and running `pi remove …` / `pi update …` from the
field (the cards' buttons already cover it).
