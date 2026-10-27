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

The message column is capped at `MESSAGE_LIST_MAX_WIDTH` (860px). At the default
window size the chat viewport is already wider than that cap, so hiding the
sidebar only changes the margins: the rows keep their width and do not reflow.
Rows do reflow below roughly sidebar width + 860px (about 1104px with the
default 244px sidebar), so measure any width-animation concern at a narrow
window instead of assuming the default one reproduces it.

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

## Message List Bottom Follow

One writer, one state, input-only transitions (`useMessageListScrollController`):

- While following, every rows-wrapper or container resize writes
  `scrollTop = scrollHeight - clientHeight` inside the ResizeObserver callback
  (after layout, before paint). No band, no model: the real DOM end.
- Only user input changes the state: wheel-up accumulating past
  `MESSAGE_LIST_SCROLL_END_THRESHOLD` disengages; wheel-down that reaches the
  end re-engages; a scrollbar drag (pointerdown on the container itself)
  disengages and is re-derived on release; new turn and the scroll-to-bottom
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

The Working/queued bars reserve their visible height in the flow
(`queueBarCount * STREAMING_QUEUE_BAR_STEP_PX`), so the list viewport always
ends above the topmost bar; content cannot be covered by them.

Measure with the painted-state probe from `pigi-jitter-debug`, never with rAF
sampling or screenshots.

## Transcript Row Spacing

Rows sit in flow inside one translated wrapper, so the virtualizer's `gap` must
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
lives in the app store (`rightSidebarTab`). Whether it is open is kept per
session (`openRightSidebarSessions`, persisted like the drafts, under
`pigi.openRightSidebarSessions`), so a new session starts with it closed
instead of inheriting another session's open sidebar on its first message. The
active tab is still global; a second tab should decide whether it follows the
session too.
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
  wheel, pinch, trackpad panning, dragging, arrow keys. The two gestures the
  overlay performs on itself — wheel and touch move dismiss it — are stopped from
  reaching it while they are the drawing's, and a click that ends a drag is not
  the click that dismisses the overlay.
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

- **pigi settings** (theme, accent, default tool view) live in `settings.json`
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
        │   ├── app/              # theme provider, sign-in, menus
        │   ├── chatInput/        # composer: Tiptap editor, reference chips, pickers
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
