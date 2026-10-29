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

## Fold the hand-picked type weights into a few composite roles

The size ramp and the 400/500/600 weight rule are documented, but call sites
still combine them by hand (`font-semibold text-caption`). When the same
combination appears a third time, add 2–3 roles — section label, row, page
title — that bundle size, weight, line height and colour, so a change lands in
one place. Do not use `h1–h6` as font-size APIs; they describe document
structure, not visual hierarchy.

## The sidebar's fade mask also fades its scrollbar

`content-fade-bottom` sits on the session list's scroll container, so the last
16px of the custom 6px rail dissolve with the content. The rail stays usable
and the fade is where the content fades too; if it becomes noticeable, move the
fade to a non-scrolling overlay above the scroll container rather than
shrinking it.
