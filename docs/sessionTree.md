# Session Tree and Fork

Status: phase 1 (tree) implemented and verified end to end. Phase 2 (fork) is
planned, not implemented. This document is the implementation plan and the
design reference for the feature. See `docs/architecture.md` for the process
model it builds on.

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
and `fork` (`IconBinaryTree` / `IconGitFork`, 15px icons in 23px buttons, no
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

- `tree` / `fork` carry a hover tooltip after a **1s** dwell (`ACTION_TOOLTIP_DELAY_MS`),
  so the labels only show up when the pointer is really parked on the icon. Copy
  has no tooltip at all — its meaning is obvious from the icon and the action is
  harmless.
- `tree` → `Move the session here`, plus a second (muted) line on user messages
  only (`This message goes back to the input box`) because that is the one case
  that moves text around. `fork` → `Continue in a new chat`.
- While disabled the tooltip shows the reason instead: `Busy summarizing the
abandoned branch` or `Wait for compaction to finish`.
- The tooltips are the app's Radix ones (`side="bottom"`, 8px viewport padding),
  not native `title` attributes: native tooltips are slow, unstyled, and do not
  appear on disabled buttons. The trigger wraps the button in a span, since a
  disabled button receives no pointer events.
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
button, opening the session tree dialog: `IconBinaryTree`, 16px, `stroke={1.5}`,
styled like the terminal button. No badge, no shortcut. `/tree` is also
registered as a built-in slash command.

Icon assignment (see §3.1 for the hover toolbar):

| Action | Icon             | Why                                                                                                                                                                                     |
| ------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tree   | `IconBinaryTree` | nodes joined by edges — unmistakably a tree, and a different silhouette from the git glyphs in the same UI (`IconSitemap` was the runner-up: clearer boxes, but reads as a layout icon) |
| fork   | `IconGitFork`    | the git fork glyph                                                                                                                                                                      |
| —      | `IconGitBranch`  | **not** used for either: the chat input already uses it for the git branch status chip                                                                                                  |

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
| tool result       | mono `name` chip + mono command, output muted, `error` trailing on failure |
| compaction        | `Compacted context` chip + summary + `12k tokens`                          |
| branch summary    | `Branch summary` chip + summary                                            |

Leading icons were removed from everything but user rows: kinds are already told
apart by the chips and by the text weight, and one landmark per turn keeps the
tree quiet.

- `Current` chip marks the effective leaf. When the real leaf is not a row (a
  model change, a label, an assistant message mid-tool-call), the deepest
  visible entry on the active path is marked instead, so the marker always has
  a row. The dialog scrolls it into view on open.
- Click a row (or `Enter` on a focused row) → navigate (§6.2). If the navigation
  would abandon content, the summary prompt (§3.4) appears after the dialog
  closes. Clicking the row that is already the current leaf just closes.
- Indentation is display-driven, not structural: a lone child continues at its
  parent's level, and each child of a fork that is not the one the active path
  follows starts a branch one level deeper. The session the user is looking at
  therefore stays flush left, and only real branches indent. One 1px guide line
  per open level, drawn in the middle of a 16px column.
- Fold chevrons appear on rows with more than one child and on the first row of
  a branch (a chain has none: the rows a fold would hide do not read as its
  children). `←`/`→` fold and unfold the focused row.
- Separate roots (returning to before the first message starts a new tree) each
  get a sticky header (`IconBinaryTree`, the same glyph as the toolbar button):
  `Tree 1`, `Tree 2`, … numbered from the oldest, with the
  row count and the tree's time span, in the accent colour when the current leaf
  lives there. Numbers follow session order, never the position of the leaf, so a
  number always names the same version. The header is also the fold switch for
  the whole tree, and because it pins to the top, a long tree never hides which
  version is being read. Sessions with a single tree get no header at all, and
  the header count shows up next to the search field as `3 trees · 70 messages`.
- Trees that do not hold the current leaf start folded, so one long tree cannot
  push the other versions out of sight. Unfolding is one click on the header
  (which reveals the tree fully expanded), and a live refresh while the dialog is
  open only unfolds newly added rows — a fold the user made is never undone.
- Keyboard: `↑`/`↓` move, `Home`/`End` jump, `←`/`→` fold, `Enter` navigates,
  typeahead is off (the search field owns typing). `↓` from the search field
  drops into the tree.
- The circular `?` at the right of the search row opens the explanation dialog
  (see §3.10). The same button sits at the right edge of the tree tooltips on the
  session toolbar and on every message row.
- Kind filter chips (`User`, `Assistant`, `Tools`, `Summaries`) toggle groups of
  entry kinds; several chips combine as OR between kinds. Only rows of the
  selected kinds are kept, and the header count turns into `n of N messages`.
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
- Hover a row → a single preview card (§3.3) with the full entry text, anchored
  below the row, or above it when the row is near the bottom. The card only
  appears when the row had to clip its text (`scrollWidth > clientWidth` on the
  text span): a row that already shows everything has nothing to preview. The
  in-flight row has no entry to read, so it never opens a card.

Implementation:

- Tree state comes from `@headless-tree/core` + `@headless-tree/react`
  (flattening, expansion, focus, hotkeys, ARIA `tree`/`treeitem` roles); the
  rows, guide lines, chips, search, filters and preview card are ours. Wire data
  is shaped into a data loader in `lib/sessionTreeData.ts` (synthetic root, kind
  - fuzzy filter with ancestor re-attachment, display depths, match indexes,
    per-tree row counts and time spans).
- The tree header folds through the same `ItemInstance` its rows use, and sits at
  `top: 0` with an opaque background so rows scroll underneath it. The list
  container has no top padding: a sticky header cannot cover it, and rows would
  show through the gap.
- The preview card is gated by a DOM measurement on entry
  (`[data-tree-row-text]`), not by a character budget: indentation, the window
  width and the chips that share the row are all part of the answer.
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
toolbar's tree tooltip, and the tree tooltip of every message row. In the
tooltips the button closes the tooltip first (`onBeforeOpen`), since the dialog
would otherwise fight the tooltip for the pointer.

### 3.4 Summary prompt

Only shown when the navigation actually abandons entries (see §6.2). One modal,
one layer, three actions:

```
This branch has 8 messages. Carry its conclusions into the new position?
  [Don't summarize]  [Summarize]  [Custom focus…]
```

`Custom focus…` expands an input inside the same dialog. Cancel (Esc) aborts the
navigation without changing the session.

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
4. Toast: `Continued in a new chat` with a `Back to the original` action.

### 3.8 Sidebar lineage

Forked sessions render under their parent with connector lines and a branch
icon:

```
refactor the auth module
├─ try approach B
│  └─ try approach B, second pass
└─ try approach C
another session
```

- A parent plus all its forks form one block; blocks are ordered by the latest
  activity in the subtree (descending), children the same way.
- Indent step 12px, capped at 3 levels.
- Connector lines are drawn with 1px divs, not glyphs.
- A session whose parent is not in the list renders as a root.
- `SessionSwitcher` (⌘R) stays flat.

### 3.9 Scroll behavior

Navigating must not jump to the bottom of the transcript. The list keeps its
current scroll position (clamped) and automatic bottom follow stays disengaged
until the next turn.

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

- The prompt is renderer state (`{ targetId, abandonedCount }`), not utility
  state.
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
const newPath =
  result.sessionPath ?? (await createSession(cwd, { parentSessionPath: activeSessionPath }));
await handleResumeSession({ path: newPath, cwd, ... }, { prefillText: result.selectedText });
void listProjectSessions([cwd]);           // lineage appears in the sidebar
toast('Continued in a new chat', { action: { label: 'Back to the original', onClick: switchBack } });
```

- `handleResumeSession` gains an optional `prefillText` that calls
  `setRestoreText` after hydration.
- `createSession` (renderer client + main bridge + utility `create_session`)
  gains an optional `parentSessionPath`.
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

| File                                                                  | Change                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/shared/ipcContract.ts`                                           | 4 tree commands, `create_session.parentSessionPath`, tree DTOs                 |
| `src/shared/messageText.ts` (new)                                     | `extractMessageText`, `clipText`, `toSingleLine`, shared by utility + renderer |
| `src/main/ipc/piAgentBridge.ts`                                       | forward `parentSessionPath` (phase 2)                                          |
| `src/processes/utility/piAgent.ts`                                    | 4 tree command handlers, `create_session` parent                               |
| `src/processes/utility/sessionTree.ts` (new)                          | pure `buildSessionTree(entries, leafId)`, `readEntryText`                      |
| `src/renderer/src/services/piAgentClient.ts`                          | 4 wrappers                                                                     |
| `src/renderer/src/lib/sessionTreeLayout.ts` (new)                     | pure: abandoned count, node → entry id, navigability                           |
| `src/renderer/src/lib/sessionTreeData.ts` (new)                       | pure: headless-tree data loader, display depths, filter, row descriptions      |
| `src/renderer/src/lib/sessionLineage.ts` (new)                        | pure: lineage build + flatten (phase 2)                                        |
| `src/renderer/src/components/SessionTreeDialog.tsx` (new)             | the dialog, rows, guide lines, hover preview card, search                      |
| `src/renderer/src/components/BranchSummaryPrompt.tsx` (new)           | the leave-branch prompt                                                        |
| `src/renderer/src/components/branchSummaryCard.tsx` (new)             | `Branch summary` card                                                          |
| `src/renderer/src/components/messageActions.tsx` (new)                | message-row actions context                                                    |
| `src/renderer/src/state/transcriptController.ts`                      | `sdkTimestamp`, `hasToolCalls`, `branchSummary` → system node                  |
| `src/renderer/src/components/messageBubbles.tsx`                      | `MessageToolbar({ node })` with tree/fork, `SystemBubble({ node })`            |
| `src/renderer/src/components/messageListRows.tsx` / `minimalView.tsx` | pass nodes to the toolbar                                                      |
| `src/renderer/src/components/SessionToolbar.tsx`                      | tree button (`IconBinaryTree`) + disabled reason                               |
| `src/renderer/src/components/StreamingQueue.tsx`                      | `busyLabel` prop                                                               |
| `src/renderer/src/components/MessageList.tsx`                         | `MessageListHandle.suspendAutoScroll()`                                        |
| `src/renderer/src/components/messageSearchTargets.ts`                 | search the branch summary body                                                 |
| `src/renderer/src/components/sidebar/sessionList.tsx`                 | lineage prefix (phase 2)                                                       |
| `src/renderer/src/lib/toolDisplay.ts`                                 | `getToolCommandPartsForTool(name, args)` for tree rows                         |
| `src/renderer/src/lib/slashCommands.ts`                               | `/tree`                                                                        |
| `src/renderer/src/App.tsx`                                            | tree navigation, summary prompt state, busy state, actions provider            |
| `docs/architecture.md`                                                | new "Session tree and fork" section (phase 3)                                  |

Dependencies added for the dialog: `@headless-tree/core` and
`@headless-tree/react` (MIT, ~19KB gzipped together). They own tree state and
ARIA; nothing else in the app uses them.

## 8. Phases

1. **tree** — done. Protocol (`get_session_tree`, `get_entry_text`,
   `navigate_session_tree`, `abort_branch_summary`), utility handlers,
   `sessionTree.ts`, transcript node fields, hover `tree`, toolbar button,
   dialog, summary prompt + progress, branch summary card, scroll behavior.
2. **fork** — `fork_session`, `create_session.parentSessionPath`, hover `fork`,
   `prefillText`, sidebar lineage.
3. **polish** — docs update, disabled-reason coverage.

### Verified so far (phase 1, CDP against scratch sessions)

- Entry-id resolution for live and hydrated rows: user, assistant (with and
  without tool calls) and tool result rows all resolve.
- Branching by navigating before a user message restores its text into the input
  box and re-points the transcript at the new branch.
- Leave-branch prompt counts (1, 2, 4, 5, 29 rows) and both answers:
  `Don't summarize`, and `Summarize` (summary entry created at the target, card
  rendered, input restored).
- Summary progress: `Summarizing branch...` in the working bar plus a toast with
  `Cancel`; cancelling before completion leaves the session untouched.
- Dialog, after the headless-tree rewrite (verified on the scratch session and
  on a synthetic session holding all five row kinds plus a second root):
  current row marked and scrolled into view, flat chains with one indent level
  per real branch, fold/expand via chevron, search (6 marks for `echo`, counts,
  ancestors kept, matched rows tinted), `↓` from the search field into the tree,
  arrow-key focus, `Esc` clears the query then closes, hover preview card above
  and below the hovered row, clicking a row raises the leave-branch prompt with
  the right count, separate roots separated by a rule.
- Navigating with a scrolled-up long transcript keeps the scroll position
  instead of jumping to the bottom.

### Not verified

- Disabled states while compacting (needs a compaction mid-navigation).
- Row rendering of a session with more than a handful of branches, and the
  dialog on the 600-message session (row count is bounded by visible entries;
  no virtualizer, per §2).
- `fork` (phase 2).

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
- Scroll behavior after navigation: confirm the list does not jump to the bottom
  and that bottom follow stays disengaged until the next turn.
- Fork: verify the new file exists, has `parentSession` in the header, appears
  in the sidebar under its parent, and that the original session still streams
  independently.

## 11. Open items

- Whether `resume_session` should forward a `session_start` event with
  `reason: 'fork'` so extensions can tell a fork from a normal resume.
- Whether the tree payload needs a `previews: false` variant if entry counts
  grow large enough for the payload to matter.
