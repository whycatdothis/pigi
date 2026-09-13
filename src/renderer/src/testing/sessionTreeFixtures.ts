/**
 * Session tree fixtures for the component tests.
 *
 * `SessionTree` is what the utility process sends the renderer, so this is the
 * shape a fake IPC boundary answers with: entries in session order, a leaf marking
 * where the session sits.
 */
import type { SessionTree, SessionTreeEntry } from '../../../shared/ipcContract';

/** Arbitrary, fixed: the rows show a time of day, so it must not be "now". */
const SESSION_START_MS = Date.UTC(2026, 0, 2, 9, 0, 0);

/**
 * One entry, `minutes` into the session.
 *
 * The offset is explicit rather than derived from the position in the list: rows
 * are compared by time, and a fixture whose times depend on the order it happens
 * to be written in cannot express "same minute".
 */
export function sessionTreeEntry(
  minutes: number,
  id: string,
  parentId: string | null,
  kind: SessionTreeEntry['kind'],
  preview: string,
  extra: Partial<SessionTreeEntry> = {},
): SessionTreeEntry {
  const timestamp = SESSION_START_MS + minutes * 60_000;
  return {
    id,
    parentId,
    timestamp,
    kind,
    preview,
    // Message entries carry the transcript's own timestamp so a node can be
    // resolved back to this entry; tool results are matched by call id instead.
    ...(kind === 'user' || kind === 'assistant' ? { messageTimestamp: timestamp } : {}),
    ...extra,
  };
}

export function sessionTree(entries: SessionTreeEntry[], leafId: string | null): SessionTree {
  return { entries, leafId };
}
