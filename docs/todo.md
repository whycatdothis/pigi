# TODO

Follow-ups that were identified but deliberately left out of a branch, because
each one is mechanical or structural enough that mixing it into a feature branch
would make the change hard to review. Delete an entry when it lands; anything
user-visible also adds a line to the CHANGELOG.

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

## Find scrolls only the outer container

`ContainerFind` brings a match into view by scrolling the viewer itself. A
match inside a code block that scrolls on its own (Files markdown preview) stays
hidden sideways, and one under the sticky line-number gutter counts as visible
because its rect is still inside the container. Fix by walking the scrollable
ancestors between the match and the container, and treating the gutter width as
an inset.
