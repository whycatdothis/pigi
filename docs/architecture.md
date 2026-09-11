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
so they can follow the current window size.

The hook marks the owning container with `data-panel-resizing` during the gesture.
Disable geometry transitions beneath this marker; dragging should follow the
pointer immediately. Reserve space with flex/grid or insets rather than moving
an overlay over a full-size message viewport.

Scope the live property narrowly. The sidebar width lives on its own wrapper,
so changing an inherited CSS variable does not invalidate styles throughout the
transcript. Flex layout gives the chat the remaining width automatically. The
terminal height lives on the common chat/terminal container because both consume it.

Native window resizing remains CSS-driven. Keep resize measurements scoped to
their consumers: the message minimap observes its own available width without
publishing it through the transcript component. Virtual rows use a stable
measurement ref and cache heights from the virtualizer's measurements, avoiding
an extra synchronous height read per row on every resize render. Bottom-follow
and user-controlled history reading remain owned by the scroll controller.

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

## File Map

```
src/
├── shared/
│   └── ipcContract.ts          # All types + channel enum (single source of truth)
├── main/
│   ├── index.ts                # App lifecycle, window creation
│   ├── ipc/
│   │   └── piAgentBridge.ts    # Lifecycle handlers (~120 lines)
│   ├── processes/
│   │   └── createPiAgentProcess.ts  # Utility process spawner
│   └── windows/
│       └── createMainWindow.ts
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
        ├── services/
        │   └── piAgentClient.ts  # Typed wrappers over piApi
        ├── state/
        │   └── appStore.ts       # Zustand store
        └── ...
```
