# Architecture

## Resizable Panels

`usePanelResize` is the shared pointer resize path for the sidebar and terminal.
Use it for future panels instead of adding another `pointermove` state setter.
It takes a container ref, a CSS custom property, the dragged edge, the committed
size, bounds, and a commit callback. A right sidebar uses `edge: 'left'`; the
existing left sidebar uses `edge: 'right'` and the bottom terminal uses `edge: 'top'`.

The hook retains the latest pointer position and writes the dimension at most
once per animation frame. Both a panel and its adjacent content consume that
same property, so their actual layout stays aligned. React/store state receives
the final dimension on release, cancellation, window blur, or unmount. Pending
frames and event listeners are cleaned up. Bounds are evaluated during movement
so they can follow the current window size, and a committed size outside the
current bounds is clamped when the drag starts, so a window that shrank since
the last drag leaves no dead zone.

A panel that passes `onCollapsedChange` is collapsible: dragging it below half
its minimum collapses it live, and dragging back out reopens it at the minimum
within the same gesture, as in a native split view. Reopening needs 8px more
than collapsing, so a hand resting on the threshold does not flip it back and
forth. Crossing the threshold unmarks the container, so the panel's own show/hide transitions animate the
collapse and the reopen; it tracks the pointer exactly again on the container's
`transitionend`. A drag that ends collapsed does not commit a size, so reopening
restores the width from before the drag. Both sidebars use it; the terminal
does not.

During the gesture the hook also shows a transparent full-window overlay with
the resize cursor as a manual popover (the top layer, above every z-index), so the cursor holds when the pointer outruns the
handle or a collapse unmounts it, and what the pointer passes over gets no
hover styles or tooltips. An overlay rather than a root attribute matched by
`:root[...] *`: toggling that would restyle the whole document twice per drag.

The hook marks the owning container with `data-panel-resizing` during the gesture.
Disable geometry transitions beneath this marker; dragging should follow the
pointer immediately. Reserve space with flex/grid or insets rather than moving
an overlay over a full-size message viewport.

Scope the live property narrowly. The sidebar width lives on its own wrapper,
so changing an inherited CSS variable does not invalidate styles throughout the
transcript. Flex layout gives the chat the remaining width automatically. The
terminal height lives on the common chat/terminal container because both consume it.

Showing and hiding the sidebar animates the wrapper between `--sidebar-width`
and `0`, so the chat keeps real reserved space while it grows. The content keeps
its full width and is anchored to the wrapper's right edge (`justify-end`), so it
slides out with the width and does not reflow. Do not slide it with its own
transform transition: two transitions drift apart when a drag retargets them
differently (a reversed transform runs shortened, a width restarted every frame
does not) and expose the transparent window between them. `min-w-full` covers
the wrapper while it eases wider than the content; whatever paints the
background inside must fill that element (`w-full`), not size itself from
`--sidebar-width` again. The collapsed wrapper is `inert` and stays mounted, so scroll position and expanded
projects survive. The toolbar title inset uses the same duration and easing
(`SIDEBAR_TRANSITION_CLASS_NAME`), so the title moves in step with the sidebar
edge. A width transition must sit under `data-panel-resizing:transition-none`.
Otherwise dragging would lag behind the pointer.

The right sidebar mirrors this: its wrapper animates between
`--right-sidebar-width` and `0`, and the content stays anchored to the wrapper's
left edge at full width (`min-w-full` likewise), so it slides in from the
window edge without a transform. Its resize handle uses `edge: 'left'`. It may always grow to
`RIGHT_SIDEBAR_ALWAYS_ALLOWED_WIDTH` (520px), and on a wide window until the
rest is `RIGHT_SIDEBAR_RESERVED_WIDTH` (the widest left sidebar plus a 480px
transcript). The drag writes `--right-sidebar-preferred-width`, and
`--right-sidebar-width` applies the same cap in CSS,
`min(var(--right-sidebar-preferred-width), max(520px, 100vw - <reserved>))`, so
making the window narrower shrinks a wide sidebar without a resize listener or
a store write. Keep the two apart: if the drag wrote the capped property, a
commit of an unchanged width would not re-render, and the plain pixel value it
left behind would drop the cap. The Quotes
tab keeps its cards in a 640px column, so a wide sidebar does not stretch quotes
into long lines.

The message column is capped at `MESSAGE_LIST_MAX_WIDTH` (960px). Rows reflow
when the sidebar is toggled only while the window is narrower than roughly
sidebar width + 960px (about 1204px with the default 244px sidebar); above that,
hiding the sidebar only changes the margins. The default 1440px window sits
above that line, so the toggle does not reflow there; measure any
width-animation concern at a narrow window, where the reflow is large.

Native window resizing remains CSS-driven. Keep resize measurements scoped to
their consumers: the message minimap observes its own available width without
publishing it through the transcript component. Virtual rows use a stable
measurement ref and cache heights from the virtualizer's measurements, avoiding
an extra synchronous height read per row on every resize render. Bottom-follow
and user-controlled history reading remain owned by the scroll controller.

### Why the renderer avoids viewport media queries

Tailwind v4 output is layered, and Blink treats any rule-set change in a layered
stylesheet as a change to every rule in it: each breakpoint crossing during a
native window resize rebuilds the font cache, invalidates every font and re-runs
style and layout for the whole document (60-80ms per crossing). This is a
desktop app with a fixed minimum width, so the desktop style is written
unconditionally. Enforced by an ESLint rule and `scripts/checkCssMediaQueries.mjs`
in `npm run build`.

### Why long animations are restricted to the compositor

A spinner or shimmer must keep moving while the main thread streams a reply, so
it may animate only `transform` and `opacity`. Chromium cannot composite a
`transform` on an `<svg>` (the transform depends on the svg's box size), which is
why a rotating icon is a wrapper around the svg (`SpinningIcon`,
`src/renderer/src/components/ui/spinningIcon.tsx`). Short click-triggered
transitions (a chevron rotating) are exempt. To check an animation, record a
trace with the `blink.animations` category and look for `compositeFailed: 0` on
its `Animation` event.

## Workspace Tabs

The main area has three fixed tabs: Chat, Files and Git. They never close;
⌘1/⌘2/⌘3 switch them; Files and Git show their keycap on hover or
focus. The Chat
tab carries the session title (double-click to rename), so the toolbar has no
separate title. While another tab is open, the Chat tab shows a spinner while
the agent runs and a dot once it finishes unseen (`unreadSessionPaths`, which
only clears when the session is shown in Chat). Welcome and new-chat screens hide the header but keep an
invisible 44px drag strip; no-session Files/Git use `WorkspaceHeader`, which
hosts the tabs without session actions. Files and Git mount on selection and
unmount on leave. Chat stays mounted and laid out while another tab shows,
with only its paint skipped (`invisible absolute inset-0`). Do not replace that
with `display: none`: it collapses every virtual transcript row to zero height,
so a reader following the bottom comes back off the bottom by about 146px. The
invisible layer also keeps the composer and its draft state alive. Switching
back resizes the box, which re-glues a following reader.

The tabs are 32px chips in the 44px header, 15px text, the active one on a
muted fill. Chat has no icon, so its title gets the room, at a fixed 320px so
Files and Git sit in the same place whatever the title is. Every tab reserves
room for its keycap; Chat's slot, at its right end, also holds the agent's
spinner or unread dot while another tab is open, so the title does not shift
when one appears, and the keycap replaces it on hover. The list is
`max-w-full`, not only `w-fit`: with `w-fit` it keeps its max-content width and
the Chat chip's `shrink` is dead code. The tabs query the header's content box,
not the viewport: below 600px the Chat chip may shrink and the keycaps go, below 500px Files and
Git drop their labels, below 320px Chat swaps its title for an icon (each tab
32px), and below 220px padding tightens to 24px per tab (about 72px for all
three). Every tab keeps its `aria-label`. The session
toolbar keeps the tree, terminal, view-mode and right-sidebar actions inline
while there is room; below 430px of header content they move into a `...` menu,
because the session tree has no other entry point. The right-sidebar toggle
also hides below 220px, but stays in that menu.

### Files freshness

The Files tree has no refresh button. The renderer sends the root, every
expanded directory and the active file to main; main watches the union of those
directories with one non-recursive `fs.watch` each, adding the active file's
parent when that directory is collapsed. A watched event names a child path:
`rename` reloads the parent's listing, `change` only matters when the child is
the active file. Events are coalesced for 80ms, so a build creating thousands
of files produces one IPC message and one `readdir` per affected directory, not
one per event. Idle watches do no polling; closing the tab, switching project
or closing the window closes them.

The watch set is intentionally bounded by what is on screen, plus the one open
file. A recursive project watch would cover directories the tree will never
expand and behaves differently across platforms; watching only expanded
directories keeps the count at the number the user opened. Reloads reuse the
request-generation guard, so a slow earlier `readdir` cannot overwrite a newer
one. Directories that disappear are dropped with their descendants, and
reopening one always rereads it.

A listing that holds exactly one directory (and is not truncated) expands and
reads that child too, and the row renders the chain compacted
(`main/java/com/example`). Expanding the children rather than only reading
them keeps them on the watch set, so a sibling created inside the chain splits
the row back apart. A collapsed directory that was never read cannot be
compacted yet; its label grows when it is first opened.

When the active file event arrives, `fileRevision` bumps and the existing
viewer effect rereads the file through the same 2MB/text/binary path. This is
why edits appear without reopening; a deleted file reports `This file no
longer exists.` instead of keeping the old contents.

### Git tab

The Git tab has three modes, as in Plannotator: all changes since a base (the
default branch unless another is picked), uncommitted changes (a base of
`HEAD`), and the last commit (read as one commit, like an opened commit). The
modes live in the tree view; Commits always uses the first against the
default branch, since it lists the branch's own commits, and Git status has a
scope of its own that reads only its two lists. Only the first mode shows the
base picker, and the summary skips the logs in the others. Main runs the git
commands (`gitDiff.ts`, 6s timeout each) and the renderer only draws. The IPC
calls: the summary (branch, base label, merge-base, the commits since the
merge-base and 30 below it, and the changed-file list with +/- counts), one
file's patch, fetched only for the selected file, one commit's file list,
fetched when that commit is opened, the branch list, fetched when the base
picker opens, and staging everything or nothing.
Comparing merge-base..HEAD plus the working tree in one patch means a file
shows committed and uncommitted edits together, which is what a reviewer of
"changes since main" wants.

The default base is the branch `origin/HEAD` points at, so a `trunk` or
`develop` is found by name; then `origin/main`, `origin/master`, `main`,
`master`, the upstream and `HEAD`, because the common case is "what did I do
since main" and every fallback still produces a useful answer. The base picker lists branches and commits on separate tabs and takes
any typed ref (`HEAD~3`, a SHA, a tag); it lists every local branch but only
the 200 most recently committed remote branches, because a large repository
can carry tens of thousands. Sorting them by date reads every branch's tip
commit (0.7s warm, 3.5s cold with 89k remote branches), so the list is read
when the picker opens, not with every summary refresh. The base is deliberately not persisted per project: a branch selected in
one repo rarely exists in another.

A project that is a folder inside a bigger repository (a monorepo package)
shows only its own changes, with paths relative to the project: `diff
--relative`, `ls-files`/`log` limited to `.`, `show <commit>:./<path>`. Quotes
then read `@src/app.ts:10` from the project the agent runs in, and the
untracked-file scan covers only the folder.

Every git call passes `--no-optional-locks`, so a summary never takes
`index.lock` from an agent that is committing, and
`diff.suppressBlankEmpty=false`, so a user setting cannot print an empty
context line as `""`, which the patch parser reads as the end of the hunk.
Listing untracked files walks the whole tree and dominates the summary on a
big repository (1.8s of about 2.2s on one 170k-file repository, where any git
process costs ~20ms and a diff against the working tree ~180ms), so
`ls-files --others` is the only command that lists them, and it starts first
with the logs and merge-base running beside it. It replaced `status -uall`,
which makes one more pass over tracked files and whose `XY` codes Git status
no longer needs.

The tab refreshes itself, quietly (no spinner, a failed refresh keeps the last
summary) when an agent in the project finishes a tool call or a run, and when
the window regains focus. Agent triggers are throttled, not debounced: the
first refreshes at once, later ones at most every 5 seconds or four times the
last summary's duration, whichever is longer, and the last is never dropped.
A debounce never fires while a long run keeps calling tools, and a fixed
interval would keep git busy for most of a run where a summary takes seconds.
Focus is rare and means the user wants to see the result, so it refreshes at
once. Any tool but the read-only built-ins (`read`, `grep`, `find`, `ls`)
counts, every bash command included: agents change files through bash as
often as through edit/write, and guessing from the command text (the chat's
`isReadOnlyBashCommand`, which only reads the first word) passed `cat > f
<<EOF` and `ls && rm` as reads. A trigger that lands during a load runs one
more load after it instead of a second one beside it.

Each scope's last summary is kept until the project changes, so switching
views shows it at once and refreshes it quietly; a scope's summary never
shows in another, where Commits would read "No commits since HEAD" from Git
status. The selected file is derived from the shown summary while
rendering: the picked file while it is listed (or, after staging, the same
path in the other group), else the first one.
Polling a fingerprint, as Plannotator does, was rejected: its fingerprint is a
`status -uall` plus a diff, 2.7s per probe on the same repository, so a
5-second poll would keep git busy half the time. There is no refresh button:
what the triggers miss (another process writing while the window has focus)
shows up the next time the window regains focus.

Untracked files are diffed through a throwaway copy of the index in which they
are marked intent-to-add (`git add -N`); the real index is never written.
`git diff <merge-base>` then treats them as new files, so a file moved without
`git add` pairs with its deleted original as a rename (Git alone reports a
deletion and an untracked file), and a new file gets real line counts and a
real patch. Patches are capped at 1.5M characters or 5,000 lines with a
`truncated` notice, so a minified bundle cannot freeze the renderer; the
same 5,000 lines cap the whole-file view and a single collapsed gap, which
otherwise renders every line at once.

The sidebar offers three views: Git status (the default), Diff (against the
chosen mode and base, the only view that takes them) and commits. Git status
is two diffs, not labels on one: Staged is `git diff --cached` (the index
against HEAD) and Unstaged is `git diff` (the working tree against the index,
untracked files included). A partly staged file shows each half in its own
group, and a change staged and then undone in the working tree still shows,
which one HEAD-to-working-tree diff split by porcelain `XY` codes got wrong.
A button at the right of each group stages or unstages everything (`git add --all --
.` / `git restore --staged -- .`, `.` so a project inside a bigger repository
only touches itself) and refreshes at once, outside the auto-refresh
interval. Git status and Diff list files as a tree (a directory holding only
one directory compacted into one row like `main/java/com/example`) or
flattened, switched by an icon at the right of the branch row that shows the
list in use. Opening a commit lists its files and shows one commit against its
first parent; a root commit diffs against the empty tree. The selection names
the list it came from (`files`, `staged`, `unstaged` or a `commit`), because
the same path can be in several, and each list's file has its own diff.

The patch response carries the file after the change (the working-tree file,
the index's `:<path>` for Staged, or `<commit>:<path>`), which is what expands the unchanged lines between
hunks and shows the whole file. It is null for deleted, binary or over-2MB
files, and when the patch was truncated: the last gap would start where the
patch was cut and show the changes after it as unmodified lines. Then only
the hunk headers show. Gaps expand in a file of any length, but the whole
file is offered only up to `MAX_DIFF_LINES` (5,000), since it draws every
line. The viewer draws the patch unified
or side by side; split rows pair each run of removed lines with the added
lines that replaced it, and wrap instead of scrolling so the two halves never
need synchronized horizontal scroll. The new side is highlighted as the whole
new file when it fits the shared shiki budget, so expanded lines are already
coloured; the old side is the patch's removed and context lines as one text.
A new patch, from another file or a refresh, renders hidden beside the one on
screen and replaces it once its highlighting lands, so switching files never
paints a blank or uncoloured frame (it used to: 120–240ms blank while the
patch was read and highlighted). A refresh keeps the scroll position; expanded
gaps collapse when the patch changes, since they are numbered by hunk. The
first load's spinner fades in late. Files and Git scrollers keep their bottom
line in place when they shrink, so the terminal opening pushes the content up
as it does in the chat. A file that is
only added or only deleted drops the +/- column, the empty gutter and the gap
rows. Quoting reuses the Files popover, gated to line cells
(`data-diff-line`): added and context lines carry new-file line numbers and
quote as `@src/app.ts:10-20`. A selection touching deleted lines has no
post-change number to point at, and a commit's numbers point into a file the
agent cannot open, so both quote the whole touched lines as a unified diff
under what they were compared with (`@src/app.ts, diff against origin/main:`,
then `-old` / `+new`); plain text there read as the file's current content.
Side by side, a drag stays in the column it starts in: the other column's
cells sit between this column's in the DOM, so the body marks the starting
side on mousedown and makes the other `select-none`, and
`diffLinesFromSelection` only reads that side. The Diff components are memoized and the workspace object is
stable, because App re-renders on every streamed agent batch and a body holds
thousands of rows.

## Message List Bottom Follow

One writer, one state, input-only transitions (`useMessageListScrollController`):

- While following, every rows-wrapper or container resize writes
  `scrollTop = scrollHeight - clientHeight` inside the ResizeObserver callback
  (after layout, before paint). No band, no model: the real DOM end.
- Only user input changes the state: wheel-up accumulating past
  `MESSAGE_LIST_SCROLL_END_THRESHOLD` disengages; wheel-down that reaches the
  end re-engages; a scrollbar thumb drag (the thumb reports its own start and
  end) disengages and is re-derived on release; new turn and the scroll-to-bottom
  button engage. Scroll events never change the state.
- The virtualizer runs with the default `anchorTo: 'start'`. Its end-anchor
  mode writes scrollTop by its own model's delta inside its own
  ResizeObserver, lands short whenever the model lags the DOM, and can run
  after the controller's write in the same frame (callbacks run in observer
  creation order). Two writers at the bottom were the root of the recurring
  "content drifts under the bottom edge" bugs.

Why not read position to decide: the scroll event for a frame-N write is
dispatched in frame N+1 before that frame's ResizeObservers, when the streaming
commit has already grown the DOM again, so a handler reads a large distance for
a viewport that is glued. Likewise a tool card mounting at its real size moves
the end hundreds of px in one frame.

What is painted is only as good as the end it glues to, so the end must be
the DOM's and must not shrink under a followed reply:

- Mounted rows sit in flow between two paddings standing in for the
  unmounted ones, so `scrollHeight` is the real rows. A sizer of the model's
  total size made the end overshoot for a frame whenever a row mounted at its
  estimate (a tool row: 80px estimated, 23px drawn), and the reply dropped
  back 50-75px when the measurement landed.
- A code line is one line box whether drawn or skipped by
  `content-visibility`. A 20px placeholder under a 22.4px line shrank a long
  block by 2.4px per line above the viewport when its highlight replaced the
  streamed plain text.

The Working/queued bars reserve their visible height in the flow
(`queueBarCount * STREAMING_QUEUE_BAR_STEP_PX`), so the list viewport always
ends above the topmost bar; content cannot be covered by them.

Measure with the painted-state probe from `pigi-jitter-debug`, never with rAF
sampling or screenshots: a reply dropping back keeps the distance from the end
at 0, so the probe also tracks how far on-screen rows move.

## Transcript Row Spacing

Rows sit in flow inside one padded wrapper, so the virtualizer's `gap` must
equal the DOM's base row gap, and every extra pixel of spacing lives in the
row's _padding_ — `measureElement` returns the border box, so padding is inside
the measured height while a margin would fall outside it and desynchronise the
scroll model (`lib/transcriptSpacing.ts`, `[data-row-space]` rules in
`main.css`).

Only the last row of a reply renders the hover action band (25px, plus the 2px
offset inside it). Rows in the middle of a reply have no band and carry the
prose rhythm instead: same kind → its own step (prose 0.8× the body size, card
1×), different kind → 1.8×. A row is classified by the edge that faces its
neighbour, not by its contents, because a reply renders thinking, then prose,
then an error card: a streaming row that opens with a thinking card and
continues into prose presents its thinking edge upwards and its prose edge
downwards.

`--markdown-*` in the message body alias the same `--message-*` values, so a
paragraph gap and a transcript gap are the same number by construction. Every
rhythm token multiplies `--text-body` rather than using `em`: `em` resolves
against the font size of the element that owns the margin, so tables (0.93em)
and code blocks (0.84em) would shrink their own gaps and the same block gap
would render at three different sizes inside one message.

## Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Process                          │
│  - Window management                                        │
│  - Session process lifecycle (spawn/kill)                    │
│  - MessagePort handshake (one-time per session)             │
│  - NOT in the data path after handshake                     │
└────────────┬──────────────────────────────────┬─────────────┘
             │ IPC (lifecycle only)             │ parentPort (lifecycle only)
             │                                  │
┌────────────▼────────────────┐   ┌─────────────▼──────────────┐
│       Renderer Process      │   │   Utility Process (N=1/session) │
│  - React UI                 │   │   - Pi SDK (one session)         │
│  - Zustand store            │   │   - StreamBatcher (16ms flush)   │
│  - Per-session port mgmt    │   │   - Command handler              │
└────────────┬────────────────┘   └─────────────▲──────────────┘
             │                                  │
             ├──────── Control MessagePort ─────┤
             │        (commands, responses)      │
             └──────── Data MessagePort ─────────┘
                      (push events, stream batches)
```

Each session gets its own utility process. Process lifecycle = session lifecycle.

## Session Creation Flow

```
Renderer                    Main                        Utility Process
   │                         │                              │
   │ invoke(create_session)  │                              │
   │────────────────────────>│                              │
   │                         │  spawn new process           │
   │                         │─────────────────────────────>│
   │                         │  postMessage({create_session, cwd})
   │                         │─────────────────────────────>│
   │                         │                              │
   │                         │                    SDK creates session
   │                         │                    gets real sessionId
   │                         │                              │
   │                         │  postMessage({session_created, sessionId})
   │                         │<─────────────────────────────│
   │                         │                              │
   │                         │  create control/data MessageChannels
   │                         │  postMessage(attach_ports, [control1, data1])
   │                         │─────────────────────────────>│
   │                         │                              │
   │  postMessage(session_port, {sessionId}, [control2, data2])
   │<────────────────────────│                              │
   │                         │                              │
   │ resolve({success, sessionId})                          │
   │<────────────────────────│                              │
   │                         │                              │
   │        ═══════ MessagePorts established ═══════        │
   │                         │                              │
   │  controlPort.postMessage({id, cmd: {type:'prompt', ...}})
   │───────────────────────────────────────────────────────>│
   │                                                        │
   │  controlPort.postMessage({id, result: {success: true}})│
   │<───────────────────────────────────────────────────────│
   │                                                        │
   │  dataPort.postMessage({type:'stream_batch', text:{...}})
   │<───────────────────────────────────────────────────────│
   │                                                        │
   │  dataPort.postMessage({type:'event', event:{...}})     │
   │<───────────────────────────────────────────────────────│
```

## Communication Channels

### Main ↔ Renderer (IPC, lifecycle only)

| Channel              | Direction       | Purpose                           |
| -------------------- | --------------- | --------------------------------- |
| `pi:create_session`  | renderer → main | Spawn process, create session     |
| `pi:resume_session`  | renderer → main | Spawn process, resume session     |
| `pi:destroy_session` | renderer → main | Kill session process              |
| `pi:session_port`    | main → renderer | Deliver control/data MessagePorts |
| `pi:process_exit`    | main → renderer | Notify unexpected crash           |

These are the **only** IPC calls. After session creation, main is idle.

### Main → Utility (parentPort, lifecycle only)

| Message                                                | Purpose                         |
| ------------------------------------------------------ | ------------------------------- |
| `{ type: 'create_session', cwd }`                      | Initialize new session          |
| `{ type: 'resume_session', sessionPath }`              | Resume existing session         |
| `{ type: 'attach_ports' }` + `[controlPort, dataPort]` | Deliver MessagePorts to utility |

### Utility → Main (parentPort, lifecycle only)

| Message                                  | Purpose                 |
| ---------------------------------------- | ----------------------- |
| `{ type: 'session_created', sessionId }` | Report real session ID  |
| `{ type: 'session_error', error }`       | Report creation failure |

### Renderer ↔ Utility (MessagePorts, runtime data)

Everything after handshake flows over two direct MessagePorts per session. Splitting low-volume controls from high-volume output prevents stream batches from delaying abort/escape commands.

**Renderer → Utility (control port commands):**

```ts
{ id: string, cmd: PiCommand }
// PiCommand = prompt | abort | get_state | get_messages | list_sessions | cycle_model | cycle_thinking_level
```

**Utility → Renderer (control port responses):**

```ts
{ id: string, result: unknown }
```

**Utility → Renderer (data port push events, no id):**

```ts
{
  type: ('session_ready', model, thinkingLevel);
}
{
  type: ('event', event);
} // agent lifecycle events
{
  type: ('error', error);
} // runtime errors
```

**Utility → Renderer (data port stream batches, high-frequency):**

```ts
{ type: 'stream_batch', text?, thinking?, toolOutput? }
// Flushed every 16ms by StreamBatcher
```

### Prompt attachment text contract

The utility process builds the text for `prompt`, `steer` and `follow_up`. It
adds three kinds of attachment plumbing that the renderer strips again before
display:

- `[Attached files]` followed by absolute paths — file attachments the agent
  reads with its tools. `splitAttachedFilesBlock` returns the paths for chips.
- `<file name="...">…</file>` inline blocks — clipboard files with no path on
  disk. `splitInlineFileBlocks` removes the body and returns the names.
- `[Attached N images]` / `[Attached N images, M files]` — the conversation
  text of an attachment-only message, so the session list has a title.

`src/shared/chatAttachments.ts` owns both sides; keep the writer in
`src/processes/utility/promptAttachments.ts` and the strippers in sync. Queued
steer/follow-up inputs are matched back to the SDK queue by the text the SDK
stores after expanding skills and prompt templates.

### Path completion in the composer

A path token containing `/`, or a bare `~`, opens the path picker. The
exception is a leading `/name` with no second slash, which stays with the
slash-command picker; `/Users/me` is absolute and completes as a path.
`pi:complete_path` reads one directory with `readdir` instead of using the
project index, because it must work outside the project and see gitignored
files. Matching is fuzzy over the last path segment. With no query, entries
are folders first; with a query, folders and files are ranked together by
match score (folders break ties), so a directory full of folder matches cannot
push every file out of the list.

A completed path is a `pathReference` chip whose `id` is the absolute path and
whose label is the full path the user typed, such as `src/renderer` or
`~/Documents`. Selecting a folder inserts just the chip. While the cursor sits
right after a folder chip, or after text glued to it with no space, the picker
lists that folder: typed text filters it (a leading `/` is tolerated), picking
a folder replaces the chip with the deeper one, and plain Backspace replaces it
with its parent (or removes a single-segment chip). The path stays editable
until a space commits it, and moving the cursor back next to the chip resumes
editing. The chip serializes with a trailing `/`, so text typed after it never
glues onto the folder name. Selecting a file replaces the folder chip with the
file chip and adds a space.

Swapping one folder chip for another can leave the suggestion range and query
unchanged, and the Tiptap suggestion plugin only notifies on those changes, so
the composer republishes the picker itself after such a swap.

A bare `~` offers the home directory; choosing it lists its children. For a
typed token, a space right after a bare folder (or `~`) closes the picker; once
a name has been typed, spaces stay in the fuzzy query so names with spaces can
match. The right arrow also closes completion.

Only POSIX paths are completed. Spaces are allowed once a name has been typed;
a path with a space in an earlier segment is easiest to pick through the folder
picker. The channel accepts any directory the renderer asks for (absolute
paths, `..`, `~`), the same trust level as file preview and the agent's own
tools; revisit this if the renderer can ever load untrusted content.

## Why This Design

| Decision                                | Rationale                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One process per session                 | Crash isolation, no shared event loop blocking                                                                                                          |
| Direct MessagePorts for runtime data    | Main not in hot path, lowest latency                                                                                                                    |
| Separate control/data ports per session | High-volume stream output cannot queue ahead of abort/escape controls                                                                                   |
| Two-step handshake                      | Real sessionId from SDK, no temporary/generated IDs                                                                                                     |
| Main only does lifecycle                | Minimal surface, easy to reason about                                                                                                                   |
| Own `CredentialStore` (disk is truth)   | SDK default snapshots auth.json once behind a 200ms lock retry; a process born during another process's 9s token refresh silently gets zero credentials |

## Session Switch

Resuming a session hydrates the transcript from the JSONL file via the session
worker (`ReadSessionMessages`) before the session's utility process is ready, and
`markSessionHydrated` stops `useTranscript` from fetching `get_messages` again
(the file is authoritative: append-only, and the old process is dead). Prompts
sent before the port exists are buffered in `App.tsx` (`pendingPromptsRef`) and
flushed on `session_ready`; the UI never shows a reconnecting state.

## Session Tree and Fork

A session file is a tree; the transcript shows one path through it. The tree
dialog reads that whole tree (`get_session_tree`) and moves the position inside
the same file (`navigate_session_tree`), and the utility process is what writes:
the renderer decides whether to ask about summarizing the abandoned branch, the
process executes the move. `navigate_session_tree` is the only command that
changes the session's shape, and it is serialized by a ref in the renderer plus
the SDK's own "cancelled" answer.

`fork_session` exports one path into a new file. It must not disturb the live
session, so it runs on a **throwaway `SessionManager`** opened over the same
file: `createBranchedSession` mutates the manager it is called on, and the live
manager is what persists the running session. The new file's header points back
at the original (`parentSession`), which is what the sidebar's lineage is built
from; a fork of the first message has nothing to copy and gets an empty new
session with that parent instead. Behind it all, `docs/sessionTree.md` is the
design reference, and `src/renderer/src/components/sessionTree/` holds the dialog
and its geometry.

The renderer side of all of it lives in `hooks/useSessionTreeNavigation.ts`: the
`tree` and `fork` actions, the leave-branch question and the move. It owns the
dialogs' state and the one-move-at-a-time guard; App.tsx renders what it returns
and hands it the few things only the shell knows — the transcript's own state,
the scroll controller, the input setter, the resume flow, and the sessions still
waiting for their process. The rule that keeps the two apart: App.tsx renders,
the hook decides, and anything the hook needs from the shell arrives as a
parameter instead of being reached for.

The dialog's list is a virtual list (`@tanstack/react-virtual`, the same one the
transcript uses), because a session can be thousands of rows long. What makes it
work is that a row's height is a constant: `ROW_HEIGHT_PX` plus the two pixels of
spacing a fork's child carries. So the whole list is arithmetic over the row
order — `components/sessionTree/sessionTreeListModel.ts` holds the items, their
offsets, the row at the top of the viewport and the branch lines — and the
geometry of a row that is nowhere near the DOM is still exact. Only the version
headers are measured, and a session with one tree has none.

Two consequences worth knowing before changing it. Branch lines belong to a fork,
not to a row: they are drawn in one inert layer behind the rows, so the rows can
be flat and windowed. And the pinned ancestor band is computed from the scroll
offset rather than measured from the DOM — the rows it mirrors usually are not
rendered. Both are covered by browser tests, which are the only layer that can
measure any of it (see `docs/testing.md`).

## Right Sidebar

`components/rightSidebar/RightSidebar.tsx` is a tabbed panel toggled from the
session toolbar. Tabs are listed in `lib/rightSidebarTabs.ts`; the active tab
lives in the app store (`rightSidebarTab`). Whether it is open is one flag for
every session (`rightSidebarOpen`), like the left sidebar and the terminal: it
starts closed on launch, adding a quote opens it, and switching sessions keeps
it as it is. Without a session (new chat, welcome screen) an open sidebar
stays open but dimmed and `inert`, since its views belong to a session.
A new view adds a tab id there, a trigger and a `TabsContent` in the sidebar.

## Quotes

Selecting text in the message list shows a floating Quote button
(`components/quotes/QuoteSelectionPopover.tsx`), placed at the selection's end:
below it for a top-down selection, above it for a bottom-up one. It turns into
a comment editor (Q while the button shows; Escape dismisses the button; both
only while the list or nothing has focus) and saves the quote to
`quotesBySession` in the app store,
keyed by session and persisted (see Unsent Drafts). While the editor has focus the quoted
range stays marked with a CSS custom highlight. The right sidebar's Quotes tab
(`QuotePanel`) lists, edits and deletes them; a plus under them adds one global
comment per session (`globalCommentBySession`, persisted the same way). Send
turns them, with the global comment last, into one plain-text message (`formatQuotesMessage` in
`lib/messageQuotes.ts`) that goes through the same path as Enter in the chat
input, so it prompts, steers or buffers just like a typed message. A comment
editor only discards its text on Escape: a pointer press outside it, including
on Send, saves a changed comment first. Adding a quote, however it is saved,
opens the Quotes tab.

The popover is positioned against the scroll container and only measures the
selection after the gesture ends (pointerup, pointercancel, keyup) or when the
container scrolls or resizes, never during a drag. An unchanged position keeps
the previous state, so scroll frames during streaming follow do not re-render
it. While editing, a quoted range scrolled out of view pins the editor to the
edge it left through.

## Unsent Drafts

Chat input drafts (`lib/chatDrafts.ts`, keyed by session path, with
`NEW_CHAT_DRAFT_KEY` for the new-chat screen) and quotes (`quotesBySession`)
survive quitting the app. Each lives under its own localStorage key
(`pigi.chatDrafts`, `pigi.quotesBySession`), so a keystroke does not
re-serialize the quotes and one malformed value cannot take the other down.
Both go through `createPersistedSessionMap` (`lib/persistedSessionMap.ts`),
which stores `{ [sessionPath]: { savedAt, value } }`:

- localStorage writes block the renderer's main thread, so saves are debounced
  (drafts 800 ms, quotes 300 ms) and a pending save is flushed on `beforeunload`.
- A failed write (over quota) removes the key instead of leaving the previous
  value, which would later restore deleted entries and lose newer ones.
- `savedAt` moves only when that session's value changes. Loading drops entries
  older than 60 days and rewrites the key without them, which also clears
  sessions that were deleted, with no link to the session list.

The in-memory Map stays the source of truth; the composer updates its draft on
every document transaction, including programmatic ones such as clearing on send.

## Collapsible Blocks

`OverflowClamp` clamps tool output, thinking, and user bubbles with pure CSS:
`flex-col justify-end` + `max-height` + `overflow: hidden` crops from the top,
so the tail stays visible and streaming follows for free. The Show less button
is `position: sticky; bottom` inside the card. Sticky is captured by any
`overflow: hidden/auto` ancestor between the button and the scroll container,
so cards use `overflow-clip` for rounded corners. Read groups
(`readGrouping.ts`) absorb thinking-only assistant messages that sit between
two groups, keeping the group id of the first tool call so expansion state
survives merging.

## Focus Rings

Chromium matches `:focus-visible` after any keypress without Cmd/Ctrl/Alt
(Shift, Escape, typing) until a mouse click moves focus to another element,
and for script focus after such a key (Radix returning focus to a menu
trigger). `lib/focusModality.ts` counts a Tab, arrow or Home/End press as
keyboard navigation only when focus moves before its keyup, so caret moves and
Tab-accepted completions do not count, and sets `data-pointer-focus` on
elements focused any other way. Text fields are never marked: they keep
Chromium's always-visible focus, like native text fields. `main.css` redefines
the Tailwind `focus-visible` variant to skip marked elements and drops the UA
outline on them, so every `focus-visible:` utility follows this rule. Raw CSS
and arbitrary selectors (`has-[...:focus-visible]`) bypass the variant.

## Mermaid Diagrams

A ` ```mermaid ` block in a message is drawn as a diagram instead of shown as
code: `markdownMessage.tsx` hands the block to `MermaidDiagram`
(`components/message/`), which owns the switch between the drawing and its
source. Everything that touches mermaid goes through `lib/mermaidRenderer.ts`,
so the rest of the app never sees the library and tests can drive the drawing
without it.

Rules that the code depends on:

- **Only a closed fence is drawn.** While a message streams, an unterminated
  fence is still a code block to the parser and its text keeps changing. The
  parser's own line numbers say whether the closing fence arrived
  (`lib/markdownFence.ts`), which is the one thing the code text cannot show: a
  half-written block is a valid prefix of the finished one. So a diagram appears
  the moment its fence closes, mid-stream or not, and a half-written block is
  never handed to mermaid.
- **One render at a time, remembered by source and theme.** Mermaid keeps its
  configuration and its working state on the module, so renders are serialized
  through a queue, and two callers asking for the same diagram at the same time
  share one render. Results are cached (bounded, oldest first) and the cache is
  readable synchronously (`peekDiagram`) so a row scrolling back into the
  virtualized window draws in its first frame instead of showing its source
  again.
- **The drawing is part of this document.** Mermaid's markup is mounted into the
  row, so the text in the drawing is text the reader can select and the
  transcript's search can find, and its colours come from the app's own rules.
  What makes that safe is mermaid's `securityLevel: 'strict'`, which is what
  leaves no script, no event handler and no `javascript:` link behind, with the
  window's CSP as the second layer. `suppressErrorRendering` keeps a failed
  diagram from appending mermaid's error graphic to the document, where it would
  sit outside the transcript and never leave. A drawing is also named after its
  diagram rather than after the render that produced it, so the same source in
  the same theme is the same markup however often it is drawn — which is what
  lets a caller mount it (and the zoom overlay, which looks its element up once,
  when it mounts) without a later draw taking the drawing out from under it.
- **The rules that style a drawing are shared.** Mermaid scopes its stylesheet to
  the id it drew under, and that stylesheet depends only on the kind of diagram
  and the theme: `lib/mermaidRenderer.ts` rewrites the scope, takes the rules out
  of the markup, and `ensureDiagramStyles` puts one copy in the document for
  every drawing that needs it (mounted in a layout effect, so the drawing is
  never painted unstyled). `DiagramGraphic` is memoised for the same reason: a
  re-render would otherwise replace the drawing's element, taking any selection
  and the overlay's reference to it with it.
- **The overlay zooms and pans the drawing.** `react-medium-image-zoom` owns the
  dialog, and `react-zoom-pan-pinch` (inside `ZoomContent`) owns the gestures:
  pinch (ctrl+wheel) zooms; a plain wheel, dragging and arrow keys pan. A plain
  wheel does not zoom because the library would hand it to zoom first, leaving
  trackpad panning nothing. The two gestures the overlay performs on itself —
  wheel and touch move dismiss it — are stopped from reaching it while they are
  the drawing's, and a click that ends a drag is not the click that dismisses the
  overlay. The same overlay (`ZoomPanContent` in `components/zoomableImage.tsx`)
  serves every content image through `ZoomableImage`: markdown and tool-output
  images, message and composer attachments, and the Files tab's image preview.
  An image inside a markdown link is not zoomable; the click is the link's.
  What the overlay fits to the window is a copy of the block that was clicked, so
  a drawing the transcript had shrunk would open at that same unreadable size. An
  SVG is therefore shown at the size mermaid laid it out at — up to the
  overlay's zoom limit — from the moment the overlay opens, and panned from
  there. Shown at the fitted size first and resized after, the drawing arrives
  small and then changes size, a second event where the reader asked for one. It
  also follows the window when the window changes, until the reader zooms the
  drawing themselves. Images keep the library's fit, which enlarges them from
  their own pixels already.
- **A diagram is drawn in mermaid's own theme.** The light window gets mermaid's
  `default` and the dark one its `dark`; no theme variable is overridden, so the
  drawing looks like the diagram it is rather than like the app's chrome around
  it. The only thing taken from the app is the font stack, so labels sit in the
  same type as the text beside them. `shared/diagramTheme.ts` holds the
  choices; the reader's pick is `appearance.diagramTheme` in pigi's settings
  file, set from the Diagrams group on the Appearance page, above a live
  mermaid sample. The palette is the reader's
  pick, not the window's: a diagram looks the same in a light and a dark window.
- **The model is told that the UI draws them.** Every session is given
  `src/processes/utility/systemPrompt.ts`, appended to pi's own system prompt
  (`appendSystemPromptOverride` in `piAgent.ts`, which appends to whatever APPEND_SYSTEM.md
  the project already has instead of replacing it), so a diagram is
  something the model can reach for rather than something it has to guess at.
  That file is where anything else the model should know about this window goes.

## Credentials

Every utility process builds its `ModelRuntime` with `FileCredentialStore`
(`src/processes/utility/fileCredentialStore.ts`): reads go to `auth.json` on
every access, writes take the same proper-lockfile lock pi uses. There is no
in-memory snapshot, so no process can be stuck with stale or empty credentials,
and a login in one process is visible to all others without respawning them.

TODO: several earlier fixes targeted the symptom of that lost snapshot (a
session or catalog with a partial model list) and are likely redundant now:
the bounded `refresh` retry inside `set_model` (piAgent.ts), the catalog
reload on model picker open (`RefreshModelCatalog`), and the full services
rebuild on `credentials_changed` (a plain `modelRuntime.refresh()` in the
worker now sees the new credentials). Once this change has proven itself,
remove them one at a time.

## Settings Page

Settings is a mode, not a modal: `appStore.settingsOpen` swaps the sidebar for
`SettingsSidebar` and the main area for `SettingsPage`, inside the same
resizable sidebar wrapper. The sidebar's top bar and `Esc` close it;
`settings.open` (⌘ ,) opens it from anywhere. Shortcut actions that navigate
close settings first, so nothing acts invisibly underneath the page.

Two data paths:

- **pigi settings** (theme, accent, default tool view, the telemetry switch
  from [telemetry.md](telemetry.md)) live in `settings.json`
  in the app's user data directory, and the main process owns that file
  (`main/pigiSettingsOwner.ts`). It reads the file before it creates the window,
  so the native theme and the window background are right from the first frame;
  the renderer's copy comes from a synchronous preload read
  (`readPigiSettings`), not an async round trip that would land after the first
  paint, and a renderer store applies it to the document at startup (no theme
  flash). After that the renderer is a client: a commit applies locally for
  instant feedback and sends only the slice it changed
  (`changePigiSettings`); main merges it onto its authoritative copy and writes
  immediately (atomic: temp file + rename). One writer is the whole ordering
  argument — writes reach the file in the order main received them, and no
  revision has to referee them. The update progress window loads the same
  bundle and reads the file at startup for its own first paint; it does not
  edit settings, so it does not need the change pushed to it.
  Keyboard shortcut definitions live in a second renderer store so edits on the
  settings page update the live bindings immediately.
  Appearance (colors, fonts, sizes, per-mode slots) is derived from one settings
  object through `src/shared/appearanceTokens.ts`; see
  [appearance.md](appearance.md) for the model and derivation rules.
- **Pi settings** are JSON files (`~/.pi/agent/settings.json`, project
  `<cwd>/.pi/settings.json`) owned by the session worker, which already runs
  the SDK. `src/shared/piSettings.ts` is the field registry that is the
  exposure boundary: the worker flattens exactly those dotted paths out of
  both files and validates every write against it, so unknown fields are
  preserved untouched. Writes are read-modify-write of the requested paths
  under the same `proper-lockfile` scheme the SDK uses, so the pi TUI can edit
  concurrently without lost updates. The renderer reads a snapshot (`global`,
  `project`, paths, trust state, pi version) and sends atomic update batches;
  project scope values resolve through global to built-in defaults, and
  `globalOnly` fields are disabled in project scope.

## Packages Page

The sidebar's Packages entry shows `components/packages/PackagesPage.tsx` in
the main area beside the normal sidebar (`appStore.packagesOpen`); showing a
session, a new chat or another workspace tab closes it. It has an Installed
and a Marketplace tab of package cards and one field over both, which filters
the installed packages or searches the marketplace. Installing from a source
has its own dialog ("Install from…", with a folder picker), because a search
field that also installs hid the install from everyone who did not already
know; the field itself only searches. The dialog's `parseInstallSource`
(`shared/piPackages.ts`) reads `pi install …`, `npm:`/`git:` sources, git
URLs, paths, npm or pi.dev package pages, and a bare word as an npm name.

**Installed packages** come from pi's own `DefaultPackageManager`, run in
`processes/utility/packageWorker.ts`, one process per request (list, check,
install/remove/update) that main kills after its one reply. Not the session
worker, for two reasons: pi runs npm and git with inherited stdio, so their
output — the only place a 404 or an auth failure is spelled out — reaches main
only through a process forked with piped stdio, and only per operation if the
process is per operation; and the check loads every extension, which runs
their code and may leave timers or children that a long-lived worker would
collect. The list itself never executes package code (resolve with `skip` for
missing sources); the check, which the page runs after every list, does: npm
`view`/`git ls-remote` for updates, the installed version's npm publish time or
git commit time for the card's age, and `discoverAndLoadExtensions` for load
errors, against agentDir rather than the project so an untrusted project's
`.pi/extensions` is not loaded. Operations queue in main, since two npm
installs into one prefix race on its lockfile, and the running operation is
kept outside the page (`usePiPackages`), which may close and reopen while npm
runs. A failure carries the captured output, and `failureReason` picks the line
a person needs (`E404` → "Not found in the npm registry") over pi's "npm
install … failed with code 1"; main resolves a request on the worker's exit,
not its reply, because the reply can overtake npm's last lines. A successful
install or update also loads that package's extensions and reports the ones
that throw, since installed is not the same as working.

**Making a change take effect** is not a window reload: extensions live in the
session utility processes. Main recycles the warm process (its prewarmed
services hold the old resources) and reloads the model catalog (an extension
may add a provider); the renderer runs the same reload as `/reload` on every
idle session and on a busy one once its reply ends
(`lib/sessionResourceReload.ts`), since pi refuses to reload mid-response.

**The catalog** has no API: pi.dev's `/api/*` answers "reserved for future
features", and its gallery is the npm registry's search for the `pi-package`
keyword. `main/packages/packageCatalog.ts` asks registry.npmjs.org first (the
only one that reports downloads), then the registry npm is configured with,
which is what a company proxy or a mirror can reach and what `pi install` will
use anyway; the registry that answered is tried first afterwards. Mirrors mix
their own packages into the results and npmmirror answers `keywords:` with
nothing, so results are filtered on the keyword and a qualified search that
finds nothing is repeated as plain text. A package's details read the README
from its packument; images and raw HTML are dropped, since the window's CSP
loads no remote image.

**Card images** are pi.dev's gallery field, `pi.image` in package.json, served
by main on `package-image://` (`main/packages/packageImages.ts`): the manifest
on disk for an installed package, the registry's `/latest` manifest for a
catalog one, then the image itself. The address names a package rather than a
URL, so the scheme in the CSP cannot be turned into a fetch of an arbitrary
address by a markdown image in chat. No image, or a failed one, is a 404 and
the card keeps the icon of what the package holds most of, tinted by that
kind (`.package-tile` in `main.css`).

## File Map

Renderer components are grouped by the surface they belong to: one directory
per surface (`transcript/`, `sessionTree/`, `message/`, …) instead of a flat
`components/` directory, so a feature's parts are found together. A component
that is used from more than one surface goes to the surface it is closest to,
not to a shared bucket.

```
src/
├── shared/
│   └── ipcContract.ts          # All types + channel enum (single source of truth)
├── main/
│   ├── index.ts                # App lifecycle, window creation
│   ├── telemetry.ts            # Telemetry queue, opt-out, install id (see telemetry.md)
│   ├── ipc/
│   │   └── piAgentBridge.ts    # Lifecycle handlers (~120 lines)
│   ├── menus/
│   │   └── applicationMenu.ts  # App menu; one update item follows update status
│   ├── processes/
│   │   └── createPiAgentProcess.ts  # Utility process spawner
│   └── windows/
│       ├── createMainWindow.ts
│       └── createUpdateProgressWindow.ts  # titled, content-sized update window (see auto-update.md)
├── preload/
│   ├── index.ts                # Port management + piApi exposure
│   └── index.d.ts              # Type declarations for window.piApi
├── processes/
│   └── utility/
│       ├── piAgent.ts          # Pi SDK session + port communication
│       ├── sessionWorker.ts    # Model catalog + session file metadata
│       └── fileCredentialStore.ts  # auth.json CredentialStore (see Credentials)
└── renderer/
    └── src/
        ├── components/           # One directory per surface, no loose files
        │   ├── app/              # workspace tabs/header, sign-in, menus
        │   ├── chatInput/        # composer: Tiptap editor, reference chips, pickers
        │   ├── files/            # file tree, source/markdown viewer, search palette, git diff sidebar/viewer
        │   ├── message/          # one message: bubbles, markdown, tools, diff
        │   ├── quotes/           # selection quote popover, quotes tab
        │   ├── rightSidebar/     # tabbed right sidebar
        │   ├── session/          # sidebar entry, session toolbar, switcher
        │   ├── sessionTree/      # tree dialog, rows, branch lines, help
        │   ├── sidebar/          # project and session lists
        │   ├── terminal/         # terminal panel, controller, theme
        │   ├── transcript/       # message list, its rows, search, mini-map
        │   ├── update/           # the standalone update progress window (see auto-update.md)
        │   └── ui/               # shadcn primitives
        ├── services/
        │   └── piAgentClient.ts  # Typed wrappers over piApi
        ├── state/
        │   ├── appStore.ts       # Zustand store
        │   ├── settingsStore.ts  # Persisted pigi preferences
        │   └── shortcutsStore.ts # Shortcut definitions (main-owned)
        └── ...
```
