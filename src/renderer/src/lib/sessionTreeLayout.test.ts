/**
 * Tests for the contract between a transcript row and the session tree: which
 * row can be a tree target or a fork point, and which entry it stands for.
 *
 * Row and entry carry different things — the transcript has no entry ids, the
 * tree has no node ids — so this matching is what the whole feature leans on:
 * a wrong answer moves the session somewhere the user did not pick.
 */
import { describe, expect, it } from 'vitest';
import type { SessionTree, SessionTreeEntry } from '../../../shared/ipcContract';
import type { AssistantNode, ToolNode, UserNode } from '../state/transcriptController';
import { isNavigableNode, resolveEntryId } from './sessionTreeLayout';

const TIMESTAMP = 1_767_000_000_000;

function entry(
  id: string,
  kind: SessionTreeEntry['kind'],
  extra: Partial<SessionTreeEntry> = {},
): SessionTreeEntry {
  return { id, parentId: null, timestamp: TIMESTAMP, kind, preview: '', ...extra };
}

function userNode(extra: Partial<UserNode> = {}): UserNode {
  return { id: 'n1', role: 'user', text: 'hello', sentAt: TIMESTAMP, ...extra };
}

function assistantNode(extra: Partial<AssistantNode> = {}): AssistantNode {
  return { id: 'n2', role: 'assistant', text: 'hi', thinking: '', isStreaming: false, ...extra };
}

function toolNode(extra: Partial<ToolNode> = {}): ToolNode {
  return {
    id: 'n3',
    role: 'tool',
    toolCallId: 'call-1',
    name: 'bash',
    args: {},
    status: 'success',
    output: 'ok',
    isError: false,
    ...extra,
  };
}

const tree: SessionTree = {
  leafId: 'a1',
  entries: [
    entry('u1', 'user', { messageTimestamp: TIMESTAMP }),
    entry('a1', 'assistant', { messageTimestamp: TIMESTAMP + 500 }),
    entry('t1', 'toolResult', { toolCallId: 'call-1', toolName: 'bash' }),
    // Same kind, no timestamp: nothing can match it.
    entry('a2', 'assistant'),
  ],
};

describe('resolveEntryId', () => {
  it('matches a user row and an assistant row by their SDK timestamp', () => {
    expect(resolveEntryId(tree, userNode({ sdkTimestamp: TIMESTAMP }))).toBe('u1');
    expect(resolveEntryId(tree, assistantNode({ sdkTimestamp: TIMESTAMP + 500 }))).toBe('a1');
  });

  it('matches a tool row by its tool call, not by a timestamp', () => {
    expect(resolveEntryId(tree, toolNode({ sdkTimestamp: TIMESTAMP + 999 }))).toBe('t1');
    expect(resolveEntryId(tree, toolNode({ toolCallId: 'call-2' }))).toBe(null);
  });

  it('resolves nothing for a row the tree has no entry for', () => {
    // Streaming rows carry no timestamp yet, and a system marker is never an
    // entry of its own.
    expect(resolveEntryId(tree, userNode())).toBe(null);
    expect(resolveEntryId(tree, assistantNode({ sdkTimestamp: TIMESTAMP + 1 }))).toBe(null);
    expect(resolveEntryId(tree, { id: 'n4', role: 'system', text: 'model changed' })).toBe(null);
  });
});

describe('isNavigableNode', () => {
  it('accepts every row that can end the context', () => {
    expect(isNavigableNode(userNode())).toBe(true);
    expect(isNavigableNode(assistantNode())).toBe(true);
    expect(isNavigableNode(toolNode())).toBe(true);
  });

  it('refuses the two that cannot', () => {
    // An answer waiting on a tool call would leave the new context ending on an
    // unanswered call, and a system marker is not a place in the conversation.
    expect(isNavigableNode(assistantNode({ hasToolCalls: true }))).toBe(false);
    expect(isNavigableNode({ id: 'n4', role: 'system', text: 'compacted' })).toBe(false);
  });
});
