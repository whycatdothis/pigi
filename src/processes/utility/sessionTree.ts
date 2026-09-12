/**
 * Session tree shaping for the renderer.
 *
 * A pi session file is a tree of entries (id/parentId) with exactly one active
 * path (the leaf). The transcript shows that path; the tree dialog shows every
 * path. This module flattens the whole tree into display-ready rows and is the
 * single source of truth for "which entries can be navigated to".
 *
 * Visibility mirrors the transcript's toolbar rules: an assistant message that
 * still has unanswered tool calls is not a safe stop (the context would end on
 * an unanswered tool call and providers reject it), so it is hidden, and its
 * children attach to its nearest visible ancestor.
 */
import type { SessionEntry, SessionMessageEntry } from '@earendil-works/pi-coding-agent';
import type { SessionTreeDto, SessionTreeEntryDto } from '../../shared/ipcContract';
import { clipText, extractMessageText, toSingleLine } from '../../shared/messageText';

/** An entry's message. Kept as a lookup so the agent-core package stays an
 *  implementation detail of the SDK. */
type SessionMessage = SessionMessageEntry['message'];

/** Row preview length. Tool output can be megabytes; rows only need a hint. */
const PREVIEW_MAX_LENGTH = 120;

/** Full text returned by get_entry_text (the hover card). */
const ENTRY_TEXT_MAX_LENGTH = 20000;

type EntryKind = SessionTreeEntryDto['kind'];

interface VisibleEntry {
  entry: SessionEntry;
  kind: EntryKind;
  /** Resolved tool arguments for tool results (they live on the assistant message). */
  toolArgs?: Record<string, unknown>;
}

/**
 * Build the flat, ordered row list for the tree dialog.
 *
 * `entries` must be in session (append) order. Rows keep their real entry ids;
 * only `parentId` is rewritten to the nearest visible ancestor.
 */
export function buildSessionTree(entries: SessionEntry[], leafId: string | null): SessionTreeDto {
  const byId = new Map<string, SessionEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }

  const toolArgsByCallId = new Map<string, Record<string, unknown>>();
  const visible = new Map<string, VisibleEntry>();

  for (const entry of entries) {
    if (entry.type === 'message' && entry.message.role === 'assistant') {
      // Tool arguments live on the assistant message that requested the call.
      collectToolArgs(entry.message, toolArgsByCallId);
    }
    const resolved = resolveVisible(entry);
    if (!resolved) continue;
    if (entry.type === 'message' && entry.message.role === 'toolResult') {
      const args = toolArgsByCallId.get(entry.message.toolCallId);
      if (args) resolved.toolArgs = args;
    }
    visible.set(entry.id, resolved);
  }

  const rows: SessionTreeEntryDto[] = [];
  for (const entry of entries) {
    const resolved = visible.get(entry.id);
    if (!resolved) continue;
    rows.push(
      toRowDto(
        entry,
        resolved,
        findNearestVisibleAncestor(entry.parentId, visible, byId),
        entry.timestamp,
      ),
    );
  }

  return { leafId: findEffectiveLeafId(leafId, visible, byId), entries: rows };
}

/**
 * Where a fork of one entry ends, and what the new chat starts with.
 *
 * `before` truncates the conversation before the entry (the entry goes back to
 * the new chat's input box, like re-typing it there); `at` keeps it.
 */
export interface ForkTarget {
  /** Entry the forked path ends at; `null` means "before everything". */
  leafId: string | null;
  /** Text to pre-fill in the new session (a user message forked `before`). */
  selectedText?: string;
}

/**
 * Resolve a fork request against the session's real entries. Returns `null`
 * when the entry is unknown — the tree the renderer picked from is a moment
 * old, and another window may have moved the session since.
 */
export function resolveForkTarget(
  entries: SessionEntry[],
  entryId: string,
  position: 'before' | 'at',
): ForkTarget | null {
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) return null;
  if (position === 'at') return { leafId: entry.id };

  const selectedText =
    entry.type === 'message' && entry.message.role === 'user'
      ? extractMessageText(entry.message.content)
      : '';
  return { leafId: entry.parentId, selectedText: selectedText || undefined };
}

/**
 * Full text of one entry, for the tree dialog's hover card. Returns an empty
 * string for entries that have no text (for example a user turn that was only
 * an image).
 */
export function readEntryText(
  entries: SessionEntry[],
  entryId: string,
): { text: string; truncated: boolean } {
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) return { text: '', truncated: false };

  let text = '';
  if (entry.type === 'message' && isLlmMessage(entry.message)) {
    text = extractMessageText(entry.message.content);
    if (!text && entry.message.role === 'assistant') {
      text = extractThinkingText(entry.message) || entry.message.errorMessage || '';
    }
  } else if (entry.type === 'compaction' || entry.type === 'branch_summary') {
    text = entry.summary;
  }

  const clipped = clipText(text, ENTRY_TEXT_MAX_LENGTH);
  return { text: clipped, truncated: clipped.length < text.length };
}

function resolveVisible(entry: SessionEntry): VisibleEntry | undefined {
  switch (entry.type) {
    case 'message': {
      const message = entry.message;
      if (message.role === 'user') return { entry, kind: 'user' };
      if (message.role === 'assistant') {
        // Unanswered tool calls are not a valid stop, so they are not rows.
        if (hasToolCalls(message)) return undefined;
        return { entry, kind: 'assistant' };
      }
      if (message.role === 'toolResult') return { entry, kind: 'toolResult' };
      return undefined;
    }
    case 'compaction':
      return { entry, kind: 'compaction' };
    case 'branch_summary':
      return { entry, kind: 'branchSummary' };
    default:
      return undefined;
  }
}

/**
 * Mark the current position. When the real leaf is not a row (a model change,
 * a label, an assistant message mid-tool-call), the deepest visible entry on
 * the active path is the position the user is looking at.
 */
function findEffectiveLeafId(
  leafId: string | null,
  visible: Map<string, VisibleEntry>,
  byId: Map<string, SessionEntry>,
): string | null {
  let currentId = leafId;
  while (currentId !== null) {
    if (visible.has(currentId)) return currentId;
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return null;
}

function findNearestVisibleAncestor(
  parentId: string | null,
  visible: Map<string, VisibleEntry>,
  byId: Map<string, SessionEntry>,
): string | null {
  let currentId = parentId;
  while (currentId !== null) {
    if (visible.has(currentId)) return currentId;
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return null;
}

function toRowDto(
  entry: SessionEntry,
  resolved: VisibleEntry,
  parentId: string | null,
  timestamp: string,
): SessionTreeEntryDto {
  const row: SessionTreeEntryDto = {
    id: entry.id,
    parentId,
    timestamp: new Date(timestamp).getTime(),
    kind: resolved.kind,
    preview: buildPreview(entry, resolved.kind),
  };

  if (entry.type === 'message') {
    row.messageTimestamp = entry.message.timestamp;
    if (entry.message.role === 'toolResult') {
      row.toolCallId = entry.message.toolCallId;
      row.toolName = entry.message.toolName;
      row.isError = entry.message.isError;
      row.toolArgs = resolved.toolArgs;
    }
    if (entry.message.role === 'assistant') {
      row.stopReason = entry.message.stopReason;
    }
  } else if (entry.type === 'compaction') {
    row.tokensBefore = entry.tokensBefore;
  }

  return row;
}

function buildPreview(entry: SessionEntry, kind: EntryKind): string {
  if (kind === 'compaction' || kind === 'branchSummary') {
    const summary =
      entry.type === 'compaction' || entry.type === 'branch_summary' ? entry.summary : '';
    return clipText(toSingleLine(summary), PREVIEW_MAX_LENGTH);
  }
  if (entry.type !== 'message') return '';

  const message = entry.message;
  if (!isLlmMessage(message)) return '';

  let text = extractMessageText(message.content);
  if (!text && message.role === 'assistant') {
    text = extractThinkingText(message) || message.errorMessage || '';
  }
  return clipText(toSingleLine(text), PREVIEW_MAX_LENGTH);
}

/** LLM messages carry `content`; coding-agent custom messages do not. */
function isLlmMessage(
  message: SessionMessage,
): message is Extract<SessionMessage, { role: 'user' | 'assistant' | 'toolResult' }> {
  return message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult';
}

function hasToolCalls(message: SessionMessage): boolean {
  if (message.role !== 'assistant') return false;
  return message.content.some((block) => block.type === 'toolCall');
}

function extractThinkingText(message: SessionMessage): string {
  if (message.role !== 'assistant') return '';
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'thinking' && block.thinking) {
      parts.push(block.thinking);
    }
  }
  return parts.join('\n');
}

function collectToolArgs(
  message: SessionMessage,
  toolArgsByCallId: Map<string, Record<string, unknown>>,
): void {
  if (message.role !== 'assistant') return;
  for (const block of message.content) {
    if (block.type !== 'toolCall') continue;
    const args = block.arguments;
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      toolArgsByCallId.set(block.id, args as Record<string, unknown>);
    }
  }
}
