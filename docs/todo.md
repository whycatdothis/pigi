# TODO

Follow-ups that were identified but deliberately left out of a branch, because
each one is mechanical or structural enough that mixing it into a feature branch
would make the change hard to review. Delete an entry when it lands; anything
user-visible also adds a line to the CHANGELOG.

## The minimap's open/close state machine

`UserMessageMiniMap` keeps `open` and `present` apart and ends the panel's life
from an `animationend` handler, with a timer as a fuse under it and `inert`
while the exit runs. That is three mechanisms for one fade, and the event-driven
unmount is the fragile part: React commits the state change a frame after the
animation ends.

Chromium supports `transition-behavior: allow-discrete` with `@starting-style`,
which would let `display` and `opacity` transition directly on the element's own
state: no second `present` flag, no `animationend` handler, no fuse, and no
window in which the panel is mounted but invisible. `present` would shrink to
"has been opened at least once" for lazy mounting.

Left out of the flash fix because that fix is a one-line cause with a test; a
rewrite of the state machine belongs in its own branch.
