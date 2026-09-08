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

| Decision                                | Rationale                                                             |
| --------------------------------------- | --------------------------------------------------------------------- |
| One process per session                 | Crash isolation, no shared event loop blocking                        |
| Direct MessagePorts for runtime data    | Main not in hot path, lowest latency                                  |
| Separate control/data ports per session | High-volume stream output cannot queue ahead of abort/escape controls |
| Two-step handshake                      | Real sessionId from SDK, no temporary/generated IDs                   |
| Main only does lifecycle                | Minimal surface, easy to reason about                                 |

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
│       └── piAgent.ts          # Pi SDK session + port communication
└── renderer/
    └── src/
        ├── services/
        │   └── piAgentClient.ts  # Typed wrappers over piApi
        ├── state/
        │   └── appStore.ts       # Zustand store
        └── ...
```
