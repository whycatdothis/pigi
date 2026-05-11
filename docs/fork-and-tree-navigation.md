# Fork and Tree Navigation Feature

## Overview

Added "tree" (navigate to a point in conversation history) and "fork" (create a new session branch from a message) buttons to the message card UI, alongside the existing copy button.

## Architecture

### SDK APIs Used

- `runtime.session.getUserMessagesForForking()` — Returns `{ entryId, text }[]` for all user messages that can be forked from. SDK-provided, safe.
- `runtime.session.fork(entryId)` — Creates a new session branching from the given entry. Returns `{ selectedText, cancelled }`. After fork, the session is replaced internally (must re-subscribe to events).
- `runtime.session.n(entryId, options?)` — Navigates the session tree to a different point. Returns `{ editorText, cancelled }`. This is what TUI calls via `/tree`.
- `runtime.session.sessionManager.getEntries()` — Returns all session entries (the tree nodes).
- `runtime.session.sessionManager.getLeafId()` — Returns the current leaf entry ID.

### How TUI Does It

- **Fork**: TUI calls `getUserMessagesForForking()` to get user messages with entry IDs, shows a selector UI (`UserMessageSelectorComponent`), then calls `fork(entryId)`. Only supports user messages.
- **Tree**: TUI calls `sessionManager.getTree()` to get the full tree structure, shows a `TreeSelectorComponent` with all entries (user + assistant), then calls `session.n(entryId)`. Supports navigating to any message.

TUI never needs to match entry IDs to rendered messages because it shows a separate selector UI built directly from entries.

### Our Approach

We put buttons directly on message bubbles, so we need to associate entry IDs with rendered message nodes.

**Entry ID enrichment in `get_messages` handler:**

- **User messages**: Use `getUserMessagesForForking()` + text content matching (FIFO queue for duplicates). This is the SDK-sanctioned approach — no risk of drift.
- **Assistant messages**: Walk the session tree path (root → leaf) and collect assistant entry IDs by index. This is slightly fragile (if `buildSessionContext` changes how it orders assistant messages, indices could drift), but assistant message entries have a stable 1:1 mapping to the messages array today.

**Why not other approaches:**
- Object reference matching: Works today (`entry.message` is the same reference as what's in `agent.state.messages`), but depends on SDK internal implementation not cloning messages. Not safe as a contract.
- Timestamp matching: `entry.message.timestamp` should be unique per message, but we can't guarantee SDK-produced timestamps are always unique.
- Full index matching for both user + assistant: Rejected because it requires replicating `buildSessionContext`'s compaction logic, which could drift.

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Utility Process (piAgent.ts)                                │
│                                                             │
│ get_messages:                                               │
│   1. Get messages from runtime.session.messages             │
│   2. Get user entry IDs via getUserMessagesForForking()     │
│   3. Get assistant entry IDs via path walk                  │
│   4. Enrich messages with entry IDs                         │
│   5. Return enriched messages                               │
│                                                             │
│ fork:                                                       │
│   1. Call runtime.fork(entryId)                             │
│   2. Re-subscribe to session events (session replaced)      │
│   3. Return { text, cancelled }                             │
│                                                             │
│ navigate_tree:                                              │
│   1. Call runtime.session.n(entryId)                        │
│   2. Return { editorText, cancelled }                       │
└─────────────────────────────────────────────────────────────┘
        ↕ IPC (MessagePort)
┌─────────────────────────────────────────────────────────────┐
│ Renderer (App.tsx)                                          │
│                                                             │
│ handleFork(entryId):                                        │
│   1. Call forkAtMessage(sessionId, entryId)                 │
│   2. Re-hydrate messages via getMessages()                  │
│   3. Set editor text from result                            │
│                                                             │
│ handleNavigateTree(entryId):                                │
│   1. Call navigateTree(sessionId, entryId)                  │
│   2. Re-hydrate messages via getMessages()                  │
│   3. Set editor text from result                            │
└─────────────────────────────────────────────────────────────┘
```

### UI Behavior

- **User messages**: Show both fork (IconGitFork) and tree (IconGitBranch) buttons on hover.
- **Assistant messages**: Show only tree (IconGitBranch) button on hover.
- Buttons only appear when the node has a real entry ID (not a local `node-X` ID from optimistic rendering). The latest user message won't have buttons until the next hydration cycle.

## Files Modified

| File | Changes |
|------|---------|
| `src/shared/ipcContract.ts` | Added `fork` and `navigate_tree` command types to `PiCommand` |
| `src/processes/utility/piAgent.ts` | Added `get_messages` enrichment logic, `fork` handler, `navigate_tree` handler |
| `src/renderer/src/services/piAgentClient.ts` | Added `forkAtMessage()` and `navigateTree()` client functions |
| `src/renderer/src/App.tsx` | Added `handleFork` and `handleNavigateTree` callbacks, passes them to MessageList |
| `src/renderer/src/components/MessageList.tsx` | Added fork/tree buttons to UserBubble and tree button to AssistantBubble |

## Known Limitations

1. **Latest message lacks buttons**: After sending a message, the optimistic node has a local `node-X` ID. Buttons won't appear until the session completes and messages are re-hydrated.
2. **Assistant index matching**: If the SDK's `buildSessionContext` changes how it orders/filters assistant messages relative to entries, the index matching could silently assign wrong IDs. Low risk but not zero.
3. **Duplicate user messages**: If a user sends the exact same text twice, the FIFO queue ensures correct ordering, but this depends on `getUserMessagesForForking()` returning entries in path order (which it does today — it iterates `getEntries()` linearly).

## Future Improvements

- Ask pi-mono to expose `getMessagesWithEntryIds()` natively, eliminating all matching logic.
- Trigger re-hydration after agent_end to ensure the latest message gets buttons immediately.
