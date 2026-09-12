# Session Tree and Fork

Status: phase 1 (tree) and phase 2 (fork) implemented and verified end to end.
Phase 3 (polish) is docs coverage and the disabled-state checks listed under
"Not verified". This document is the implementation plan and the design
reference for the feature. See `docs/architecture.md` for the process model it
builds on.

## 1. Goal

Bring pi's two session-exploration primitives to pigi, adapted to a GUI:

- **tree** — move the current position inside the session file. The session is
  stored as a tree (`id`/`parentId`); going back to an earlier point and
  sending again creates a new branch, and the abandoned branch stays in the
  file.
- **fork** — copy the conversation up to a chosen message into a new session
  file and continue there, leaving the original session untouched.

The transcript always shows only the active branch. Old branches are reachable
through the session tree dialog.

## 2. Non-goals

- No labels (pi's `Shift+L` bookmarks).
- No cross-branch search.
- No filter UI in the tree dialog (search only).
- No inline branch markers in the transcript, no minimap changes, no right-side
  tree panel.
- No `1/2` sibling switcher.
- No virtualization in the tree dialog (see §3.3).
- No new keyboard shortcut, no toolbar badge.
- No `fork of「…」` chip in the session toolbar.
- No extension hooks (`session_before_tree`, `session_before_fork`,
  `commandContextActions`). pigi does not pass them today; this feature does not
  add them.

## 3. UX

### 3.1 Message hover toolbar

Every message row already shows a copy button on hover. Extend it with `tree`
and `fork` (`SessionTreeIcon` / `SessionForkIcon` from
`sessionTree/sessionTreeIcons.tsx`, 15px icons in 23px buttons, no
visible text label). All three share one look: a 6px-radius hover background
(`hover:bg-muted`), 4px between buttons, and a 2px gap above the toolbar row
(plus the buttons' 4px padding) so the icons sit the same distance below a user
bubble, below assistant text, and below a tool block — the tool rows used to sit
flush against the block's border. The words `tree` / `fork` live in the tooltips, the
`/tree` command, and the toolbar's `Session tree` button.
| Button | Node | Action |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `tree` | user message | Move the position to **before** this message, put its text back in the input box, focus the input. Sending again creates a new branch. |
| `tree` | assistant message | Move the position **onto** this message; clear the input. |
| `tree` | tool result | Move the position onto this tool result (i.e. "after this tool finished"). |
| `fork` | user message | New session containing everything **before** this message; the message text is pre-filled in the new session's input. |
| `fork` | assistant message / tool result | New session containing everything **up to and including** this message; no pre-fill. |

Availability rules:

- `tree` / `fork` are **not** offered on an assistant message whose content
  contains tool call blocks (see §5.3).
- They are hidden while that specific row is in flight — a streaming assistant
  message or a running tool call has no session entry yet, so there is nothing
  to navigate to.
- Both are disabled while `transcript.isCompacting` or while a branch summary is
  running, with a tooltip explaining why (`disabledReason` in the actions
  context).
- Both are disabled while the session's utility process is still starting;
  clicking then reports "The session is still starting".
- While streaming, `tree` aborts the current response first (reusing the
  existing abort path, which restores queued messages to the input box) and
  then runs. `fork` does the same.
- Both are unavailable in a draft chat (no session file yet).

UI copy: icon-only buttons.

- `tree` / `fork` carry a hover tooltip after a **0.5s** dwell (`ACTION_TOOLTIP_DELAY_MS`),
  so the labels only show up when the pointer settles on the icon, without the
  second of waiting that read as "the tooltip is broken". Copy has no tooltip at
  all — its meaning is obvious from the icon and the action is harmless.
- `tree` → `Move the session here`, plus a second (muted) line on user messages
  only (`This message goes back to the input box`) because that is the one case
  that moves text around. `fork` → `Fork this msg in new session`.
- While disabled the tooltip shows the reason instead: `Busy summarizing the
abandoned branch` or `Wait for compaction to finish`.
- The tooltips are the app's Radix ones (`side="bottom"`, 8px viewport padding),
  not native `title` attributes: native tooltips are slow, unstyled, and do not
  appear on disabled buttons. The trigger wraps the button in a span, since a
  disabled button receives no pointer events.
- `tree` and `fork` share **one** tooltip per row, anchored to the pair of icons,
  and its label follows the icon the pointer is on. Two tooltips side by side do
  not hand over: Radix builds a "grace area" on trigger leave — the corridor the
  pointer may use to travel into the tooltip — and with the icons 4px apart that
  area covers the icon next door, so the next trigger stays shut while the first
  label never goes away. On the group, the corridor is the toolbar itself: the
  label changes as the pointer crosses the gap, and the `?` inside the tooltip
  stays reachable (clicking it closes the tooltip and opens the help dialog).
  That `?` belongs to the tree's label and goes away with it: on `fork` the
  tooltip is only the label, since the session tree is not what that icon is
  about.
- Colour comes from `TooltipContent`'s `variant`, which now defaults to
  `surface` — the same family as popover / dialog / context menu (`bg-popover`,
  `ring-[0.5px] ring-foreground/25`, `shadow-md`), so it follows the theme in
  dark mode. `variant="inverted"` still gives shadcn's stock black bubble.
- `ui/tooltip.tsx` no longer draws the pointer triangle for anybody: every
  tooltip in the app is a plain rounded rectangle, and the shared `TooltipContent`
  now defaults to a 6px offset so nothing sits flush against its anchor.
- Motion is defined once, for every tooltip, at the end of `main.css`: a 160ms
  decelerating rise (4px along the anchor's axis plus 0.97 → 1 scale, curvature
  `cubic-bezier(0.22, 1, 0.36, 1)`) and a 110ms exit that sinks back 2px and
  scales to 0.985. It replaces the stock `zoom-in-95` + 8px slide + arrow, which
  read as a pop. The keyframes are keyed off the `tooltip-surface` class that the
  component puts on its content element, so a new tooltip cannot forget them and
  the component still owns the styling contract.

### 3.2 Session toolbar

`SessionToolbar` gains one icon button between the title area and the terminal
button, opening the session tree dialog: `SessionTreeIcon`, 16px,
styled like the terminal button. No badge, no shortcut. `/tree` is also
registered as a built-in slash command.

Icon assignment (see §3.1 for the hover toolbar):

Both glyphs live in `components/sessionTree/sessionTreeIcons.tsx` and every surface takes them from there: the message actions, the toolbar button, the `Tree 1` headers and the help dialog. Nothing imports the Tabler icons for these two directly any more, so the pair cannot drift apart.

| Action | Icon (Tabler)                     | Why                                                                                                                                                                                                                                                   |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tree   | `IconBinaryTree2`, `scale-[1.15]` | a root node with two children — unmistakably a tree, and a different silhouette from the git glyphs in the same UI (`IconSitemap` was the runner-up: clearer boxes, but reads as a layout icon)                                                       |
| fork   | `IconArrowFork`, `rotate-90`      | one stem splitting into two arrows, turned so the arms point the way the message goes (right, out of the branch you are on). `IconGitFork` was the first pick: correct, but the git glyphs are also the branch-status vocabulary elsewhere in the app |
| —      | `IconGitBranch`                   | **not** used for either: the chat input already uses it for the git branch status chip                                                                                                                                                                |

The tree's `scale-[1.15]` is not a size change: the box stays whatever `size` asks
for, and `transform` never affects layout. It corrects the drawing, which is
smaller than the icons it sits next to — 16 of the 24 units in its viewBox, where
`copy` and the fork use 18 — so its height ends up level with them instead of
reading as the small one in the row.

### 3.3 Session tree dialog

A centered modal (`App.tsx` level, next to `SessionSwitcher`), `min(880px,
92vw)` by 76vh, no title bar and no close button: the top is the search field
plus a row of kind filters, the rest is the tree.

```
┌ 🔍 Search this session              3 trees · 70 messages   (?)       ┐
│  ( User ) ( Assistant ) ( Tools ) ( Summaries )                      │
│ ⌄ 🌳 Tree 1  63 messages                              00:41 – 12:08   │
│  👤  refactor the auth module                               14:02    │
│      Let me look at the current…                            14:02    │
│      bash  $ pwd · /Users/…                                 14:05    │
│ ⌄    Done, tests pass                                       14:15    │
│ │ ⌄👤 try the adapter approach                               14:10    │
│ │      There is a type error…                                14:11    │
│ ⌄ 🌳 Tree 2  4 messages                                      15:30    │
│  👤  second root: how do I start it?                        15:30    │
└──────────────────────────────────────────────────────────────────────┘
```

Rows:

| Entry             | Row                                                                        |
| ----------------- | -------------------------------------------------------------------------- |
| user message      | accent user chip + medium-weight text (the only kind with a leading icon)  |
| assistant message | plain regular text; errors turn it destructive and add an `error` trailing |
| tool result       | mono command, output muted, `error` trailing on failure                    |
| compaction        | `Compacted context` chip + summary + `12k tokens`                          |
| branch summary    | `Branch summary` chip + summary                                            |

Leading icons were removed from everything but user rows, and tool rows no longer
repeat their tool's name as a chip: the command already starts with it (`$ pwd`,
`read src/foo.ts`), so the chip was a second, competing label. The name is still
what a query is matched against, which keeps `bash` able to find those rows.

- A `Current` chip marks the effective leaf — a chip, not a tinted row: the
  position has to be readable while the pointer is on it, and a background would
  be painted over by the hover. When the real leaf is not a row (a model change,
  a label, an assistant message mid-tool-call), the deepest visible entry on the
  active path is marked instead, so the marker always has a row. The dialog
  scrolls it into view on open.
- Click a row (or `Enter` on a focused row) → navigate (§6.2). If the navigation
  would abandon content, the summary prompt (§3.4) opens on top of this dialog;
  otherwise the dialog closes and the move goes ahead. Clicking the row that is
  already the current leaf just closes the dialog.
- No row draws a focus ring: a click puts the tree's keyboard cursor on that row
  (arrows continue from there, `Enter` activates it) but leaves no mark behind,
  not even after a prompt is cancelled. The cursor is invisible by design; the
  hover, the match background and the `Current` chip are the only row states on
  screen.
- Indentation is display-driven, not structural: a lone child continues at its
  parent's level, every child of a fork moves one level deeper. Depth is a
  property of the tree alone — moving the leaf never re-lays the rows out.
- A fork is drawn as a rail plus elbows, not as bare indentation (see
  the layout notes below).
- Fold chevrons appear on rows with more than one child and on every child of a
  fork (a chain has none: the rows a fold would hide do not read as its
  children). `←`/`→` fold and unfold the focused row. A chevron is 16px at the
  default stroke weight: thicker than the icons around it would read as bold.
- Separate roots (returning to before the first message starts a new tree) each
  get a sticky header (`SessionTreeIcon`, the same glyph as the toolbar button):
  `Tree 1`, `Tree 2`, … numbered from the oldest, with the
  row count and the tree's time span, in the accent colour when the current leaf
  lives there. Numbers follow session order, never the position of the leaf, so a
  number always names the same version. The header is also the fold switch for
  the whole tree, and because it pins to the top, a long tree never hides which
  version is being read. Sessions with a single tree get no header at all, and
  the header count shows up next to the search field as `3 trees · 70 messages`.
  The trees are drawn from the whole session, not from the filtered rows, so a
  search keeps them: a match stays placed in its version, the numbering does not
  shift, and a tree whose rows are all filtered out — or folded — still shows its
  header. Rows group by _tree_, not by where they ended up in the list: with the
  kind filters a tree can lose its root row and re-attach higher up, and its rows
  must still land under one header.
- Trees that do not hold the current leaf start folded, so one long tree cannot
  push the other versions out of sight; a filter or a search unfolds every tree,
  because that is about rows, not versions. Folding is done by the dialog on the
  whole group (the tree's rows are left out of the list) rather than through a
  row item: folding one root row of a filtered tree would hide part of it, and
  the rows of a folded tree should cost nothing to render. Unfolding is one click
  on the header, and a live refresh while the dialog is open only unfolds newly
  added rows — a fold the user made is never undone.
- Keyboard: `↑`/`↓` move, `Home`/`End` jump, `←`/`→` fold, `Enter` navigates,
  typeahead is off (the search field owns typing). `↓` from the search field
  drops into the tree.
- The circular `?` at the right of the search row opens the explanation dialog
  (see §3.10). The same button sits at the right edge of the tree tooltips on the
  session toolbar and on every message row.
- Kind filter chips (`User`, `Assistant`, `Tools`, `Summaries`) toggle groups of
  entry kinds; several chips combine as OR between kinds. Only rows of the
  selected kinds are kept, and the header count turns into `n of N messages`.
  A row's hover is `bg-foreground/10` — a visible grey, where the old
  `bg-muted/70` was `oklch(0.97 0 0)` at 70% and read as nothing on the dialog's
  surface. It is one class for every row: the current row is marked by its chip,
  so no second `background-color` can compete for the same state, and which of
  two utilities would win would otherwise be decided by the order Tailwind emits
  them in, not by the order they are written.
- Search is fuzzy (`fuzzysort`, the same library the session switcher and the
  slash commands use): `astnt` finds `assistant`. Matched characters are marked
  in the row text. Rows keep session order — this is a tree, not a ranked list —
  so the score only decides _whether_ a row matches, not where it sits.
- Search and filters are combined with AND. Ancestors of a match stay visible to
  keep the tree readable, but only when they pass the kind filter themselves:
  "Assistant only" must not smuggle user rows back in.
- `Enter` in the search field navigates to the first listed row. `Esc` clears the
  search and the filters first (Radix `onEscapeKeyDown` + `preventDefault`); only
  a second `Esc`, with nothing to clear, closes the dialog.
- Hover a row → a single preview card (§3.3) with the full entry text. The card
  only appears when the row had to clip its text (`scrollWidth > clientWidth` on
  the text span): a row that already shows everything has nothing to preview.

Implementation:

- Tree state comes from `@headless-tree/core` + `@headless-tree/react`
  (flattening, expansion, focus, hotkeys, ARIA `tree`/`treeitem` roles); the
  rows, branch lines, chips, search, filters and preview card are ours. Wire data
  is shaped into a data loader in `lib/sessionTreeData.ts` (synthetic root, kind
  - fuzzy filter with ancestor re-attachment, match indexes,
    per-tree row counts and time spans).
- The rows are rendered as a **nested tree**, not as the library's flat list:
  `buildSessionTreeDisplay` turns the visible items into nodes whose children are
  the rows of a fork and whose lone children are continuations. Nesting is what
  puts the structure lines in the DOM: a branch is one element that spans a whole
  subtree, instead of every row drawing the pieces passing over it. A fork's
  wrapper needs no measurement to know where its line ends, and a continuation
  adds no element at all, so a long conversation stays a flat list.
- The tree header sits at
  `top: 0` so rows scroll underneath it. Its background is `--dialog-solid`, an
  opaque colour-mix that equals the dialog's surface (popover at 88% over the
  `bg-black/20` overlay): the translucent material itself would tint a second
  time and read as a white band in light mode, and would let rows show through.
  The list container has no top padding: a sticky header cannot cover it, and
  rows would show through the gap.
- A fork is drawn from its row's fold chevron: the branch line leaves the **fork
  row's bottom edge**, exactly under that chevron's centre, and each direct child
  gets a horizontal elbow at its own row's centre, from that line to the left
  edge of the child's chevron box. The line crosses to the chevron instead of
  running on to the icon: they share the same column, and stopping at its edge
  keeps the chevron readable as a control.
- Every child of a fork is one `TreeBranch` wrapper holding the line and the
  elbow, and the wrapper spans that child's **whole subtree**. Siblings are
  adjacent, so their lines join without a seam, and no row has to know where the
  fork above it started. The last child's line stops at its own row's centre (its
  wrapper clips it to `padding + ROW_HEIGHT_PX / 2`) while the others run the
  wrapper's full height, which is what makes a fork visibly end at its last
  child. The two meet in a plain 90° corner — no rounded elbow: a radius made the
  curve leave the line mid-way and read as a second, unrelated line. The corner
  pixel belongs to the line: the elbow element starts one pixel to its right, so
  no pixel is painted twice. Overlapping them would darken the corner (the lines
  are translucent) and, at an accented fork, blend the accent with neutral grey.
  A child's line is **two elements**: the run from the fork's edge down to the
  turn into that child (`BRANCH_LAST_RAIL_HEIGHT_PX` tall, the same run the last
  child's line is), and the run below it, which carries the fork down to the next
  sibling. That second piece belongs to the sibling below, not to this child —
  what the highlight does with it depends on where the path goes (next bullet).
  The first piece is the one the highlight can **grow**: down to the lit row, when
  the path turns in at a row below this child (`findLitRowOffsetPx` measures that
  row inside the child's subtree, spacing included).
- Indentation is the **row's own padding** (`rowContentX(depth)`), not a gutter
  element. A level is 20px (`INDENT_PX`) and the wrapper adds the remaining 4px
  between its line and the row — geometry that only exists once, in
  `components/sessionTree/sessionTreeGeometry.ts`, next to the constants it is derived from: the chevron
  box, the row height and the branch spacing are all set from those constants
  instead of from classes, so a layout change cannot silently leave the lines
  behind. (The row box still spans the whole list so the gutter stays clickable;
  only its _highlight_ is the content box.)
- The spacing above a branch's children sits on the **wrapper**
  (`BRANCH_SPACING_PX`), not on the row: a row margin would leave a 2px gap in
  the line between siblings, and a line that runs from the fork's edge has to
  cover it.
- Lines are hairlines: 1px, on whole pixels — a half-pixel position antialiases
  into a fat grey bar, which is exactly what the old guide lines looked like.
- Colour says where the leaf is, and where the pointer is. The path is described
  by one row per indent level (`collectPathOwners`): walking up from the lit row,
  the branch child the path _enters_ that level through. For every child of a
  fork, that decides what lights up:
  - the child the path turns into — the elbow into it, and the run of line down
    to the lit row (so the line reaches the row it leads to, not just the fork).
    A row deep inside a branch is reached through the first row of that branch, so
    its line lights down to the row itself: the run covers the rows in between,
    and the line is next to what the pointer is on, not only above it;
  - a sibling _before_ it — the elbow is not the path's, but the line is: the path
    runs past it on the way down, so both pieces light and the run stays unbroken;
  - a sibling after it — nothing: that line belongs to another branch.
    The last child has no second piece to light. Hovering replaces the leaf's own
    path while the pointer is on a row, so the highlight always answers "which line
    is this" for what is under the cursor.
- Hovering a row highlights the branch line it sits on, all the way up: every
  rail and elbow between the row and the outermost fork it descends from turns
  accent. The set is the row plus **every** row above it on the display path
  (`collectRowAncestors`) — not one per level: a chain of lone children shares a
  level, so the row that draws the line at that level is the _first_ row of the
  chain, which a one-per-level walk would skip. Rows without a wrapper draw
  nothing, so carrying them in the set costs a Set lookup and nothing else. The
  hover state is keyed by the ids it is made of, so moving along one chain does
  not re-render the list.
- The ancestors of the top row are pinned above the list: scrolling past a fork
  used to hide who the visible rows hang from. `PinnedAncestors` renders the rows
  that **own a visible line** above it (`collectBranchOwners`: a row qualifies
  when the row below it on the path hangs from it one indent deeper) — one per
  level, indent included, so the stack is as tall as the nesting and not as long
  as the conversation — inside a
  `sticky top-0 z-20 h-0` layer, offset by the tree header's height. It takes no
  space in the flow (nothing shifts when it appears), it is opaque
  (`--dialog-solid`, like the headers) so rows scroll underneath it, and its rows
  are clickable copies that move the session; they are `aria-hidden` because the
  rows they copy are right there in the tree.
- The band's offsets are measured, not modelled: a `useLayoutEffect` reads every
  row's `offsetTop` and the header height once per row set (folding and filtering
  change `visibleRowCount`, which is what the effect keys on) into a ref, and a
  scroll listener picks the row at the top of the readable area on an animation
  frame. Re-measuring per scroll frame would force a layout every frame, which is
  the expensive half of a feature like this.
- The structure data is just the display tree plus the set of entries on the
  active path (`activePathIds`); the renderer derives the line geometry from the
  nesting level it is rendering, so `sessionTreeData.ts` no longer computes
  per-row rails.
- The preview card is gated by a DOM measurement on entry
  (`[data-tree-row-text]`), not by a character budget: indentation, the window
  width and the chips that share the row are all part of the answer.
- The card is reachable. It overlaps the hovered row (its top starts at the
  row's top, or its bottom at the row's bottom near the end of the list) instead
  of hanging below it, so the pointer can travel sideways out of the row and into
  the card without ever touching the rows in between. A transparent wrapper
  around the card owns the hover, covers the visual margin and reaches the
  dialog's right edge, so no gap can dismiss it; and leaving a row only
  schedules the change — 200ms (`CARD_SWITCH_DELAY_MS`) that entering the card
  cancels — so crossing rows on the way there does not steal the card or close
  it. Scrolling inside the card works as expected.
- The explanation lives in `SessionTreeHelpDialog.tsx` (dialog + round button)
  and is opened through `sessionTreeHelp.ts` (context + `useSessionTreeHelp`).
  The dialog is mounted once at `App` level, because the buttons live in
  transient places: inside tooltips and inside the tree dialog itself.
- The dialog re-reads the tree whenever the session grows while it is open
  (`revision` prop = node count + agent status), so a turn that lands while the
  dialog is up fills in by itself.
- Every read is a **fresh list**: the data loader reads the dataset directly
  (no cache and no `rebuildTree()`), and the list is keyed by
  `session path + query + kinds + read counter`, so a new dataset mounts new tree
  state. The tree library caches children ids per item, and a refresh that only
  re-expands ids leaves the newly appended rows out; remounting cannot. Only the
  first read of a visit scrolls to the current row, so a refresh never yanks the
  list out from under the user. Unknown ids answer with an empty item (a hot
  reload must not crash a row), and the loaded tree carries the path it came
  from, so switching sessions cannot show the previous session's tree.
- Fixed row height (32px), plain buttons, no virtualizer, no per-row popovers.

### 3.10 The "?" explanation

`SessionTreeHelpDialog` is one modal with three short points — jump anywhere in
the history (nothing is deleted), summarize the branch you leave or skip it, and
keep going from anywhere (a new branch, always returnable). It is reachable from
a round `?` button in three places: the tree dialog's search row, the session
toolbar's tree tooltip, and the tree label of every message row (not the fork's). In the
tooltips the button closes the tooltip first (`onBeforeOpen`), since the dialog
would otherwise fight the tooltip for the pointer.

### 3.4 Summary prompt

Only shown when the navigation actually abandons entries (see §6.2). It opens
**on top of the tree dialog**, not after it: the message the user picked stays on
screen behind the question, so the answer has context. Two answers, nothing else:

```
Leave this branch?
59 messages leave the conversation. They stay in the session tree and can be
returned to at any time.
                                  [Summarize]  [Don't summarize]
```

- There is no `Cancel` button and no custom-instructions input: cancelling is
  closing the dialog (Esc, the `x`, or a click outside it), and it drops only the
  move — the tree dialog stays open, so the user is back at the list they were
  reading.
- Answering either way closes the tree dialog and runs the navigation; only the
  `Summarize` answer then shows the progress toast (§3.5). The buttons are
  `[Summarize] [Don't summarize]`, with the accent (`--system-accent`) on
  `Don't summarize`: leaving is the plain move and the accent marks it, while
  summarizing is the extra step.
- A pick that abandons nothing needs no question: the tree dialog closes and the
  navigation runs immediately.

### 3.5 Summary progress

While a summarizing navigation is in flight:

- `toast.loading('Summarizing the abandoned branch…')` with a `Cancel` action
  that sends `abort_branch_summary`.
- The working bar (`StreamingQueue`) stays visible with the label
  `Summarizing branch…`, and the chat input treats the session as busy.

### 3.6 Branch summary card

`branchSummary` messages are currently dropped by the transcript controller.
Add a system card: a collapsed one-line `Branch summary` row that expands to the
rendered summary, visually at the same level as the compaction marker. Search
targets include the summary text, not just the label.

### 3.7 Fork

After `fork`:

1. The new session is created on disk (§6.4).
2. The app switches to it immediately, with the input pre-focused and (for user
   messages) pre-filled with the message text.
3. The original session stays open in the background and remains in the sidebar.
4. No toast. The active session switching to a forked chat, with the fork
   nested under the original in the sidebar, is the whole report; another
   notification on top of that was noise, and `Back to the original` duplicated
   the sidebar row that is right there.

### 3.8 Sidebar lineage

Forked sessions render under their parent with connector lines:

```
refactor the auth module
├─ try approach B
│  └─ try approach B, second pass
└─ try approach C
another session
```

- A parent plus all its forks form one block; blocks are ordered by the latest
  activity in the subtree (descending), children the same way. A block that is
  used while its parent is untouched therefore rises with it, instead of the
  parent sinking on its own old timestamp.
- One 12px column per ancestor level, capped at 3 levels (deeper forks keep the
  innermost columns; the extra levels would be a staircase off the sidebar's
  edge). The list's items are 4px apart, so a column that runs on covers that
  gap as well: a dash every 24px would read as a broken line.
- Each column is a 1px div (`bg-foreground/15`), not a glyph: the corner is one
  vertical piece plus one horizontal piece, so nothing is painted twice.
- A session whose parent is not in the list renders as a root — including a fork
  of the first message, which has no file yet. That session is in the store
  while its process runs, and the store entry carries `parentSessionPath` for
  exactly this window, so the connector is right from the first frame instead of
  only after the sidebar's next listing.
- `SessionSwitcher` (⌘R) stays flat.

### 3.9 Scroll behavior

Navigating lands at the bottom of the branch you moved to: the picked message is
where the session continues from, so that is what should be in view.

The list is told to hold its position while the old transcript is still on
screen, then to follow (`MessageListHandle.scrollToBottom()` →
`followAfterContentSwap`). Following is what does the work: the swap changes the
rows wrapper, and its observer glues scrollTop to the new end as soon as the new
rows are laid out. No write happens at the moment of the swap — that would
measure the content on its way out, and a frame of it could reach the screen —
so the hook also writes once in a rAF, for a replacement whose height happens to
match the old one (a ResizeObserver only fires on a size change).

The reader's own scroll is not overridden: this happens only on a deliberate
move, and follow stays on afterwards, exactly as it would after sending a
message.

## 4. Architecture

### 4.1 Boundaries

| Layer                             | Owns                                                                          | Does not own                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| utility process (one per session) | session state: reading the tree, navigating, summarizing, creating fork files | any UI decision: whether to ask about summarizing, how to render, where to scroll |
| session worker                    | unchanged by this feature                                                     | —                                                                                 |
| renderer                          | every UI decision, session switching, scroll, editor text                     | never touches session files                                                       |

Rule: the utility process answers "what is / do this"; the renderer decides
"should we / how to show it".

### 4.2 Why fork runs in the utility process

`SessionManager.createBranchedSession(leafId)` is the SDK function that exports a
branch: it walks the path to the leaf, drops label entries and re-chains
parents, remaps `firstKeptEntryId` on compactions, writes a new header with
`parentSession`, and writes the file. It is an instance method that **mutates
the manager it is called on** (the manager afterwards points at the new file).

The utility process holds the live manager used to persist the running session,
so it must not be mutated. Instead the utility opens a **throwaway second
manager** over the same file, calls `createBranchedSession` on it, and returns
the new path:

```ts
const temp = SessionManager.open(currentFile, sessionManager.getSessionDir());
const newPath = temp.createBranchedSession(targetLeafId);
// temp is discarded; the live manager never learns about the fork
```

This is exactly what pi's `AgentSessionRuntime.fork()` does before it swaps the
runtime. Safe because session files are append-only and every entry is written
with `appendFileSync`/`writeFileSync`, and because `createBranchedSession` only
writes the new file.

Considered and rejected:

- `runtime.fork()` — replaces the live session in place. pigi keys the process
  pool, transcript controllers, navigation history, and the sidebar by
  `sessionPath`, and the original session must stay open, so an in-place move is
  not acceptable.
- renderer — no filesystem access.
- main process — lifecycle only, must not touch session files.
- session worker — valid (it is the file service) but costs two extra hops and
  a request/response pair. Revisit if fork ever needs to work for sessions that
  are not open.

### 4.3 Protocol principles

- 5 new commands, **0 new push types**. Everything is request/response.
- The streaming path (`StreamBatcher`, `message_update`) is untouched.
- No new dependencies, no SDK changes.

## 5. Protocol

### 5.1 Commands (`src/shared/ipcContract.ts`, added to `PiCommand`)

```ts
/** Read the tree. Used by the dialog and for entry id resolution. */
| { type: 'get_session_tree' }
// → SessionTreeDto

/** Full text of one entry, for the hover preview card. */
| { type: 'get_entry_text'; entryId: string }
// → { text: string; truncated: boolean }

/** Move the session position. */
| { type: 'navigate_session_tree'; targetId: string; summarize: boolean; customInstructions?: string }
// → { success: boolean; cancelled: boolean; aborted?: boolean; editorText?: string; error?: string }

/** Cancel an in-flight branch summary. */
| { type: 'abort_branch_summary' }

/** Create a fork file. */
| { type: 'fork_session'; entryId: string; position: 'before' | 'at' }
// → { success: boolean; sessionPath?: string; selectedText?: string; needsNewSession?: boolean; error?: string }
```

`UtilityCommand.create_session` gains an optional `parentSessionPath?: string`,
forwarded to `SessionManager.create(cwd, sessionDir, { parentSession })`.

### 5.2 Payloads

```ts
export interface SessionTreeEntryDto {
  id: string;
  parentId: string | null;
  timestamp: number; // entry timestamp, ms
  kind: 'user' | 'assistant' | 'toolResult' | 'compaction' | 'branchSummary';
  preview: string; // single line, ≤120 chars
  // message entries: used to resolve transcript nodes back to entry ids
  messageTimestamp?: number;
  toolCallId?: string;
  // display extras
  toolName?: string;
  toolArgs?: Record<string, unknown>; // trimmed, formatted in the renderer
  isError?: boolean;
  tokensBefore?: number; // compaction
  stopReason?: string; // assistant
}

export interface SessionTreeDto {
  leafId: string | null;
  entries: SessionTreeEntryDto[]; // visible set, ascending by timestamp
}
```

### 5.3 Visible entry rules (computed in the utility process)

Include:

- user messages
- assistant messages whose content contains no `toolCall` block
- tool results — kept, like pi's default tree view (pi's `no-tools` filter mode
  is what hides them). Stopping right after a tool call is a real thing to want,
  and the tool row is the only row that represents that point.
- compaction entries
- branch summary entries
- the deepest visible entry on the active path, so `●` always has a row (see
  §3.3). Note this is not necessarily the real leaf: when the leaf is excluded
  above, the marker moves up to the last visible row.

Exclude:

- assistant messages that contain `toolCall` blocks. A mid-turn assistant
  message is not a useful place to stop, and leaving it out keeps the tree
  shorter. (pi hides these only when they carry no text and are not the current
  leaf; the dangling tool call is harmless either way, because pi-ai inserts
  synthetic empty tool results for orphaned tool calls before sending —
  `pi-ai/dist/api/transform-messages.js`.)
- `model_change`, `thinking_level_change`, `session_info`, `custom`, `label`
- `custom_message` and `bashExecution` (the transcript does not render them
  either)

This is also the invariant behind the toolbar: **the tree contains exactly the
entries whose messages get `tree`/`fork` buttons in the transcript.**

`parentId` on a row is the nearest visible ancestor, so a tool result whose
parent assistant message is hidden (it had tool calls) still hangs off the user
message instead of becoming a root, and a run of tool results stays a chain
rather than becoming siblings.

## 6. Flows

### 6.1 Resolving a transcript node to an entry id

Entry ids never reach the transcript today, and `message_end` is emitted before
the entry is appended, so no push can carry the id without extra plumbing. Use
on-demand resolution instead:

1. `TranscriptController` keeps, on message nodes: `sdkTimestamp`
   (`message.timestamp`, set on `message_start`, refreshed on `message_end`, and
   taken from hydrated messages) and `toolCallId` (already present on tool
   nodes). `AssistantNode` also gets `hasToolCalls` from the existing
   `extractAssistantContent` result. Tool rows take their timestamp from the
   tool result message's own `message_start` event, because
   `tool_execution_end` carries the raw tool result, which has no timestamp.
2. On click, `get_session_tree` is fetched fresh and searched:
   tool nodes by `toolCallId`, everything else by `(role, messageTimestamp)`.
3. A miss is surfaced as a toast, never a silent failure.

No cache, no invalidation logic, no changes to the streaming path. The cost is
one round trip on click, which is imperceptible.

### 6.2 Tree navigation

```
renderer                                        utility
  │ user clicks tree / a dialog row
  │ 1. reject while isCompacting (toast)
  │ 2. if streaming → existing abort path (restores queued messages)
  │ 3. compute abandoned count locally from the tree payload
  │      > 0 → summary prompt (§3.4)
  │ 4. navigate_session_tree ──────────────────>│ session.navigateTree(targetId,
  │                                             │   { summarize, customInstructions })
  │ ← { editorText, cancelled, aborted } ───────│
  │ 5. controller.reset()
  │ 6. get_messages ───────────────────────────>│ session.messages (rebuilt for the new leaf)
  │ ← messages ────────────────────────────────│
  │ 7. controller.hydrate(messages, compactionCount)
  │ 8. editorText → setRestoreText
  │ 9. suspendAutoScroll() — stay where the user was
  │ 10. refreshSessionState() — context usage, compaction count
```

Notes:

- **Step 5 is mandatory.** `hydrate()` replaces; `mergeHydratedMessages()`
  prepends history and would mix the abandoned branch back in.
- **Single flight.** A `navInFlightRef` serializes navigation; the SDK rejects
  navigation while a response, compaction, or another navigation is active and
  leaves the branch unchanged.
- The abandoned count is computed client-side from the payload: find the deepest
  entry present on both the leaf path and the target path (the common ancestor);
  the abandoned entries are the ones between the leaf and it, exclusive. If the
  target is a descendant of the leaf, nothing is abandoned and no prompt
  appears. If the two paths share no ancestor at all (for example after
  returning to before the first message, which creates a second root), the whole
  current path is abandoned and counted. The count is over _visible_ rows, which
  is what the user sees in the dialog, so it can differ by a few from pi's own
  count of raw entries.
- The SDK attaches a summary entry **after** the target position, so the summary
  becomes part of the new branch. Nothing has to be reordered.

### 6.3 Summary prompt, progress, cancel

- The prompt is renderer state (`{ entryId, abandonedCount }`), not utility
  state. It renders above the tree dialog; the tree dialog is only closed when
  the move is decided (answered, or cancelled).
- While `navigate_session_tree` with `summarize: true` is in flight, the
  renderer sets a local `branchSummary` state: `isBusy` becomes true,
  `StreamingQueue` shows `Summarizing branch…`, the input refuses to send, and
  the loading toast offers `Cancel` → `abort_branch_summary` →
  `session.abortBranchSummary()`. The pending `navigateTree` then resolves with
  `{ cancelled: true, aborted: true }` and the renderer closes the toast without
  navigating.

### 6.4 Fork

Utility (`fork_session`):

```ts
if (session.isStreaming || session.isCompacting) return error('busy');
const file = session.sessionManager.getSessionFile();
if (!file || !existsSync(file)) return error('session not saved yet');

const entry = session.sessionManager.getEntry(entryId);
if (!entry) return error('entry not found');

const targetLeafId = position === 'before' ? entry.parentId : entry.id;
const selectedText = position === 'before' ? extractMessageText(entry.message.content) : undefined;

// Forking the first user message: the truncated path is empty and the SDK does
// not create a file for an assistant-free branch.
if (!targetLeafId) return { success: true, needsNewSession: true, selectedText };

const temp = SessionManager.open(file, session.sessionManager.getSessionDir());
const newPath = temp.createBranchedSession(targetLeafId);
if (!newPath || !existsSync(newPath)) {
  // Defensive: paths without an assistant message are not flushed immediately.
  return { success: true, needsNewSession: true, selectedText };
}
return { success: true, sessionPath: newPath, selectedText };
```

Renderer:

```ts
const result = await forkSession(activeSessionPath, entryId, position);
// `needsNewSession` means there was nothing to copy: an empty file would never
// be written, so the new chat is created with this session as its parent.
const newPath = result.sessionPath ?? (await createSession(cwd, activeSessionPath));
await handleResumeSession(
  { path: newPath, parentSessionPath: activeSessionPath, ... },
  { prefillText: result.selectedText, freshSession: !result.sessionPath },
);
void listProjectSessions([cwd]); // the fork appears under this session
await resumeSession(newPath);    // only when the fork wrote a file
```

- `handleResumeSession` gains `prefillText` (put this text in the input box once
  the session is showing) and `freshSession` (the session was just created:
  there is no file to hydrate and its ports are already attached, so the resume
  steps are skipped — re-attaching would replace the port the live transcript
  subscriptions are on).
- What a fork is called in the sidebar comes from its own first message, which
  is the parent's: giving the store entry the parent's title keeps the two in
  step until the listing lands.
- The original session's utility process keeps running; the pool's idle LRU may
  evict it later, which is harmless (the file is on disk).

### 6.5 Branch summary rendering

`buildSessionContext()` already converts `branch_summary` entries into
`branchSummary` messages, so after a summarizing navigation the next
`get_messages` contains one. The controller maps it to:

```ts
SystemNode & { kind: 'branch'; detail: string }
```

and `SystemBubble` renders `kind === 'branch'` as a collapsible card. Keep
`kind: 'compaction'` for the existing compaction marker. Check
`messageSearchTargets.ts` and `minimalView.tsx` for the new node shape.

### 6.6 Sidebar lineage

New pure module `src/renderer/src/lib/sessionLineage.ts`:

```ts
buildLineage(sessions: PiSessionInfo[]): LineageNode[]
flattenLineage(roots: LineageNode[]): Array<{
  session: PiSessionInfo;
  depth: number;
  isLast: boolean;
  ancestorContinues: boolean[];
}>
```

`sidebar/sessionList.tsx` renders a `LineagePrefix` before the title, drawing
one 12px column per ancestor level and a corner for the current row. Path
comparison for `parentSessionPath` is case-insensitive on Windows.

## 7. File changes

| File                                                                             | Change                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/shared/ipcContract.ts`                                                      | 4 tree commands, `create_session.parentSessionPath`, tree DTOs                 |
| `src/shared/messageText.ts` (new)                                                | `extractMessageText`, `clipText`, `toSingleLine`, shared by utility + renderer |
| `src/main/ipc/piAgentBridge.ts`                                                  | forward `parentSessionPath`                                                    |
| `src/processes/utility/piAgent.ts`                                               | 4 tree command handlers, `fork_session`, `create_session` parent               |
| `src/processes/utility/sessionTree.ts` (new)                                     | pure `buildSessionTree(entries, leafId)`, `readEntryText`, `resolveForkTarget` |
| `src/renderer/src/services/piAgentClient.ts`                                     | 4 tree wrappers + `forkSession`, `createSession` parent                        |
| `src/renderer/src/lib/sessionTreeLayout.ts` (new)                                | pure: abandoned count, node → entry id, navigability                           |
| `src/renderer/src/lib/sessionTreeData.ts` (new)                                  | pure: headless-tree data loader, display tree, active path, filter, row text   |
| `src/renderer/src/lib/sessionLineage.ts` (new)                                   | pure: lineage build + flatten                                                  |
| `src/renderer/src/components/sessionTree/SessionTreeDialog.tsx` (new)            | the dialog shell: the read behind it, a visit's state, the preview card        |
| `src/renderer/src/components/sessionTree/SessionTreeList.tsx`                    | the scrolling list: the tree, its version headers, branch lines, row recursion |
| `src/renderer/src/components/sessionTree/SessionTreeRow.tsx`                     | one row and its insides, shared with the pinned copies                         |
| `src/renderer/src/components/sessionTree/SessionTreeHeader.tsx`                  | the `Tree n` section header                                                    |
| `src/renderer/src/components/sessionTree/SessionTreePinnedBand.tsx`              | the ancestors pinned to the top of the list                                    |
| `src/renderer/src/components/sessionTree/SessionTreeToolbar.tsx`                 | search, row count, kind filter chips                                           |
| `src/renderer/src/components/sessionTree/sessionTreeGeometry.ts` (new)           | row/line/preview-card geometry, shared by the components above                 |
| `src/renderer/src/hooks/useSessionTreePreview.ts` (new)                          | the hover preview: which row has a card, where it sits, what it says           |
| `src/renderer/src/components/sessionTree/BranchSummaryPrompt.tsx` (new)          | the leave-branch prompt                                                        |
| `src/renderer/src/components/message/branchSummaryCard.tsx` (new)                | `Branch summary` card                                                          |
| `src/renderer/src/components/message/messageActions.tsx` (new)                   | message-row actions context                                                    |
| `src/renderer/src/state/transcriptController.ts`                                 | `sdkTimestamp`, `hasToolCalls`, `branchSummary` → system node                  |
| `src/renderer/src/components/message/messageBubbles.tsx`                         | `MessageToolbar({ node })` with tree/fork, `SystemBubble({ node })`            |
| `src/renderer/src/components/transcript/messageListRows.tsx` / `minimalView.tsx` | pass nodes to the toolbar                                                      |
| `src/renderer/src/components/session/SessionToolbar.tsx`                         | tree button (`SessionTreeIcon`) + disabled reason                              |
| `src/renderer/src/components/sessionTree/sessionTreeIcons.tsx`                   | the tree / fork glyphs, defined once for every surface                         |
| `src/renderer/src/components/transcript/StreamingQueue.tsx`                      | `busyLabel` prop                                                               |
| `src/renderer/src/components/transcript/MessageList.tsx`                         | `MessageListHandle.suspendAutoScroll()`                                        |
| `src/renderer/src/components/transcript/messageSearchTargets.ts`                 | search the branch summary body                                                 |
| `src/renderer/src/components/sidebar/sessionList.tsx`                            | lineage prefix, one row per fork                                               |
| `src/renderer/src/lib/projectSessions.ts`                                        | carry `parentSessionPath` for a running session                                |
| `src/renderer/src/state/appStore.ts`                                             | `SessionEntry.parentSessionPath`                                               |
| `src/renderer/src/lib/toolDisplay.ts`                                            | `getToolCommandPartsForTool(name, args)` for tree rows                         |
| `src/renderer/src/lib/slashCommands.ts`                                          | `/tree`                                                                        |
| `src/renderer/src/App.tsx`                                                       | tree navigation + fork, summary prompt state, busy state, actions provider     |
| `docs/architecture.md`                                                           | new "Session tree and fork" section (phase 3)                                  |

Dependencies added for the dialog: `@headless-tree/core` and
`@headless-tree/react` (MIT, ~19KB gzipped together). They own tree state and
ARIA; nothing else in the app uses them.

## 8. Phases

1. **tree** — done. Protocol (`get_session_tree`, `get_entry_text`,
   `navigate_session_tree`, `abort_branch_summary`), utility handlers,
   `sessionTree.ts`, transcript node fields, hover `tree`, toolbar button,
   dialog, summary prompt + progress, branch summary card, scroll behavior.
2. **fork** — done. `fork_session`, `create_session.parentSessionPath`, hover
   `fork`, `prefillText`, sidebar lineage.
3. **polish** — docs update, disabled-reason coverage.

### Automated tests

`npm test` (vitest, no DOM) covers the parts that are pure functions and were
iterated on by hand the most. CI (`.github/workflows/ci.yml`) runs it on every
push together with the typecheck, lint and format checks:

- `processes/utility/sessionTree.test.ts` — which entries become rows at all
  (an assistant message waiting on a tool call does not), where their children
  re-attach once hidden rows are dropped, which row carries the current position
  when the leaf is not a row, tool arguments carried onto result rows,
  `readEntryText` including truncation, and `resolveForkTarget` (forking at an
  entry vs. before it, and which fork point hands a user message back).
- `lib/sessionLineage.test.ts` — nesting a fork under its parent, the order of a
  block (subtree activity, not the parent's own timestamp), a missing parent and
  a parent cycle both rendering as roots, Windows path case, and the connector
  columns (`ancestorContinues`) the rows are drawn from.
- `components/sessionTree/sessionTreeGeometry.test.ts` — where a lit row sits
  inside a branch child's subtree (the run the highlight grows into).
- `lib/sessionTreeData.test.ts` — filtering (kind filters re-attaching kept rows,
  ancestors kept for a query, highlight indexes skipping the unprinted label,
  tree numbering fixed by the session rather than by the filter), the indentation
  the rows are nested into (continuation vs. fork, folded subtrees gone), the
  branch-line tints for a lit path, `countAbandonedEntries`, `collectBranchOwners`
  and the row descriptions.

Everything that needs a mounted dialog — hover, the pinned band, scrolling,
focus and the preview card's timers — is still verified by hand in the running
app; those checks are the ones in the list below.

### Verified so far (phase 1 and 2, CDP against scratch sessions)

- Entry-id resolution for live and hydrated rows: user, assistant (with and
  without tool calls) and tool result rows all resolve.
- Branching by navigating before a user message restores its text into the input
  box and re-points the transcript at the new branch.
- Leave-branch prompt counts (1, 2, 4, 5, 29 rows) and both answers:
  `Don't summarize`, and `Summarize` (summary entry created at the target, card
  rendered, input restored). It opens above the tree dialog, which stays mounted
  behind it; answering closes both, closing it cancels the move.
- Summary progress: `Summarizing branch...` in the working bar plus a toast with
  `Cancel`; cancelling before completion leaves the session untouched.
- Dialog, after the headless-tree rewrite (verified on the scratch session and
  on a synthetic session holding all five row kinds plus a second root):
  current row marked and scrolled into view, flat chains with one indent level
  per real branch, fold/expand via chevron, search (6 marks for `echo`, counts,
  ancestors kept, matched rows tinted), `↓` from the search field into the tree,
  arrow-key focus (no ring: the cursor is invisible), `Esc` clears the query then
  closes, hovering a row lights its branch line up the tree, the top row keeps
  its ancestors pinned under the header while scrolling, hover preview card above and below the hovered row, clicking a row raises the leave-branch prompt with
  the right count, separate roots separated by a rule.
- Branch line hover (verified on the three-tree scratch session, hovering
  `输出一下当前时间` in Tree 1): its own rail and elbow turn accent _and_ the rail
  and elbow of the fork above it, while the sibling branch below stays neutral and
  everything reverts on leave. Pinned
  ancestors: no band at the top of the list, and one row per indent level
  (16px / 36px indents, stacked at 28px steps under the header) once a deep row
  is scrolled to.
- Navigating with a scrolled-up long transcript lands at the bottom of the
  branch moved to: 66-message scratch session, read the middle (1920px from the
  end, follow off), pick a deep row → `scrollTop === scrollHeight −
clientHeight` (8535/8535), scroll button hidden (follow on). The same jump
  from a transcript shorter than the viewport (0/0) also ends at the bottom.
- Fork, on a 66-message scratch session:
  - `fork` on a user message writes a new file whose header carries
    `parentSession` (the source), whose entries end at the message _before_ the
    forked one, and whose first turn is _not_ in the file; the app switched to
    it, and the message text was in the input box (44 nodes against the source's
    46).
  - `fork` on an assistant message keeps that answer, pre-fills nothing, and the
    new session's transcript matches the source up to that point.
  - `fork` on the first user message has nothing to copy (`needsNewSession`): the
    app created an empty session with the source as its parent and pre-filled
    the first message.
  - The sidebar nests the fork under the source with `├─` / `└─` connectors
    (one 12px column, continuous across the list's 4px item gap), the block
    rises with the fork's activity, and the fork of the first message is nested
    from the first frame even though it has no file yet.
  - The original session keeps its process, its leaf and its file: forking does
    not touch it, and the tree dialog still shows its whole history afterward.
    Switching back to it from the sidebar restores its transcript as it was.

### Not verified

- Disabled states while compacting (needs a compaction mid-navigation).
- Row rendering of a session with more than a handful of branches, and the
  dialog on the 600-message session (row count is bounded by visible entries;
  no virtualizer, per §2).
- Multi-level lineage (a fork of a fork) beyond the unit tests: the rendering
  path is the same at every depth, but no session with a grandchild fork has
  been opened by hand.

## 9. Edge cases

1. Never `mergeHydratedMessages` after navigation (§6.2).
2. Assistant messages with tool calls: no toolbar actions, no tree row.
3. Forking the first user message → empty path → new session with
   `parentSession`.
4. Source file missing (`existsSync`) → clear error, or the new-session path.
5. `createBranchedSession` returning a path that was not flushed → new-session
   path.
6. Two concurrent navigations / forks → ref guards.
7. Multiple roots (the SDK can create them via `resetLeaf()`) → dialog and
   sidebar both render root lists, not a single root.
8. `get_entry_text` must truncate large tool output and report `truncated`.
9. Windows path case in `parentSessionPath` comparison.
10. Summary in flight while the user switches sessions → the toast/`Cancel`
    targets the session that started it; do not mutate the newly active one.
11. `tree` on a message whose entry id cannot be resolved → toast, no silent
    no-op.

## 10. Verification

- `npm run check` after every change.
- Manual CDP run with the `pigi-debug` skill: create a branch by editing a user
  message, reopen the tree dialog, jump back, confirm the transcript, input box
  and context usage.
- Scroll behavior after navigation: confirm the transcript ends up at the
  bottom of the branch moved to (including when the reader was scrolled up
  before the move) and that follow is on afterwards, so the next turn keeps
  following.
- Fork: verify the new file exists, has `parentSession` in the header, appears
  in the sidebar under its parent, and that the original session still streams
  independently.

## 11. Open items

- Whether `resume_session` should forward a `session_start` event with
  `reason: 'fork'` so extensions can tell a fork from a normal resume.
- Whether the tree payload needs a `previews: false` variant if entry counts
  grow large enough for the payload to matter.
