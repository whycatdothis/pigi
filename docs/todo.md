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
