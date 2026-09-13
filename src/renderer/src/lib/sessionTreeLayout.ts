/**
 * Pure helpers for session tree navigation.
 *
 * The tree dialog renders itself through headless-tree (see
 * `sessionTreeData.ts`); what stays here is the bookkeeping the navigation flow
 * needs: how many entries a move would abandon, and how a transcript node maps
 * back to a session entry.
 */
import type { SessionTree, SessionTreeEntry } from '../../../shared/ipcContract';
import type { TranscriptNode } from '../state/transcriptController';

/**
 * Entries that would be dropped from the active path by moving to `targetId`.
 *
 * The abandoned entries are the ones between the current leaf and the deepest
 * common ancestor of the leaf and the target. Moving to a descendant of the
 * current leaf abandons nothing.
 */
export function countAbandonedEntries(tree: SessionTree, targetId: string): number {
  if (!tree.leafId || tree.leafId === targetId) return 0;

  const byId = new Map<string, SessionTreeEntry>();
  for (const entry of tree.entries) {
    byId.set(entry.id, entry);
  }

  const targetPathIds = new Set<string>();
  for (const entry of pathToRoot(byId, targetId)) {
    targetPathIds.add(entry.id);
  }

  const leafPath = pathToRoot(byId, tree.leafId);
  const commonAncestorIndex = leafPath.findIndex((entry) => targetPathIds.has(entry.id));
  // No shared ancestor (the position and the target are on different root
  // trees, for example after returning to before the first message): the whole
  // current path leaves the conversation.
  if (commonAncestorIndex < 0) return leafPath.length;
  return commonAncestorIndex;
}

function pathToRoot(byId: Map<string, SessionTreeEntry>, startId: string): SessionTreeEntry[] {
  const path: SessionTreeEntry[] = [];
  let current = byId.get(startId);
  while (current) {
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * Resolve a transcript node back to its session entry id.
 *
 * Entry ids never reach the transcript: `message_end` is emitted before the
 * entry is appended, and hydrated messages carry no id. Every node does carry
 * what the entry carries, so the tree is fetched on demand and matched here.
 */
export function resolveEntryId(tree: SessionTree, node: TranscriptNode): string | null {
  if (node.role === 'tool') {
    const match = tree.entries.find(
      (entry) => entry.kind === 'toolResult' && entry.toolCallId === node.toolCallId,
    );
    return match?.id ?? null;
  }
  if (node.role === 'user') {
    const timestamp = node.sdkTimestamp;
    if (timestamp === undefined) return null;
    const match = tree.entries.find(
      (entry) => entry.kind === 'user' && entry.messageTimestamp === timestamp,
    );
    return match?.id ?? null;
  }
  if (node.role === 'assistant') {
    const timestamp = node.sdkTimestamp;
    if (timestamp === undefined) return null;
    const match = tree.entries.find(
      (entry) => entry.kind === 'assistant' && entry.messageTimestamp === timestamp,
    );
    return match?.id ?? null;
  }
  return null;
}

/**
 * Whether a transcript node can be a tree target or a fork point. Assistant
 * messages that still have unanswered tool calls are excluded: the context
 * would end on an unanswered tool call.
 */
export function isNavigableNode(node: TranscriptNode): boolean {
  if (node.role === 'system') return false;
  if (node.role === 'assistant') return !node.hasToolCalls;
  return true;
}
