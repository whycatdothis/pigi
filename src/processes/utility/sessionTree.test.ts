/**
 * Tests for the session tree shaping that runs in the utility process.
 *
 * The rules worth pinning down here are the ones the dialog depends on and that
 * are easy to break: which entries are rows at all, where their parents land
 * after hidden entries are dropped, and which row carries the current position.
 */
import { describe, expect, it } from 'vitest';
import type { SessionEntry, SessionMessageEntry } from '@earendil-works/pi-coding-agent';
import type { TextContent, ToolCall } from '@earendil-works/pi-ai';
import { buildSessionTree, readEntryText } from './sessionTree';

const TIMESTAMP = '2026-01-01T10:00:00.000Z';

function userEntry(id: string, parentId: string | null, text: string): SessionEntry {
  return messageEntry(id, parentId, { role: 'user', content: text, timestamp: 1 });
}

function assistantEntry(
  id: string,
  parentId: string | null,
  text: string,
  toolCall?: { id: string; name: string; arguments: Record<string, unknown> },
): SessionEntry {
  const content: (TextContent | ToolCall)[] = [{ type: 'text', text }];
  if (toolCall) content.push({ type: 'toolCall', ...toolCall });
  return messageEntry(id, parentId, {
    role: 'assistant',
    content,
    api: 'test-api',
    provider: 'test-provider',
    model: 'test-model',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: toolCall ? 'toolUse' : 'stop',
    timestamp: 2,
  });
}

function toolResultEntry(id: string, parentId: string | null, toolCallId: string): SessionEntry {
  return messageEntry(id, parentId, {
    role: 'toolResult',
    toolCallId,
    toolName: 'bash',
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
    timestamp: 3,
  });
}

function modelChangeEntry(id: string, parentId: string | null): SessionEntry {
  return {
    type: 'model_change',
    id,
    parentId,
    timestamp: TIMESTAMP,
    provider: 'test-provider',
    modelId: 'test-model',
  };
}

function compactionEntry(
  id: string,
  parentId: string | null,
  summary: string,
  tokensBefore: number,
): SessionEntry {
  return {
    type: 'compaction',
    id,
    parentId,
    timestamp: TIMESTAMP,
    summary,
    firstKeptEntryId: parentId ?? id,
    tokensBefore,
  };
}

function branchSummaryEntry(id: string, parentId: string | null, summary: string): SessionEntry {
  return {
    type: 'branch_summary',
    id,
    parentId,
    timestamp: TIMESTAMP,
    fromId: parentId ?? id,
    summary,
  };
}

function messageEntry(
  id: string,
  parentId: string | null,
  message: SessionMessageEntry['message'],
): SessionEntry {
  return { type: 'message', id, parentId, timestamp: TIMESTAMP, message };
}

describe('buildSessionTree', () => {
  it('hides an assistant message that is waiting on a tool call and re-attaches what hangs off it', () => {
    const entries = [
      userEntry('u1', null, 'run it'),
      assistantEntry('a1', 'u1', 'running', { id: 'c1', name: 'bash', arguments: {} }),
      toolResultEntry('r1', 'a1', 'c1'),
      userEntry('u2', 'a1', 'never mind'),
    ];

    const tree = buildSessionTree(entries, 'u2');

    expect(tree.entries.map((entry) => entry.id)).toEqual(['u1', 'r1', 'u2']);
    // The hidden message is not a row, so its result and its next turn hang from
    // the nearest row above it.
    expect(tree.entries.find((entry) => entry.id === 'r1')?.parentId).toBe('u1');
    expect(tree.entries.find((entry) => entry.id === 'u2')?.parentId).toBe('u1');
  });

  it('marks the deepest row of the active path when the leaf itself is not a row', () => {
    const entries = [
      userEntry('u1', null, 'run it'),
      assistantEntry('a1', 'u1', 'running', { id: 'c1', name: 'bash', arguments: {} }),
    ];

    expect(buildSessionTree(entries, 'a1').leafId).toBe('u1');
  });

  it('rewrites parents across entries that are not rows at all', () => {
    const entries = [
      userEntry('u1', null, 'hello'),
      modelChangeEntry('m1', 'u1'),
      assistantEntry('a1', 'm1', 'hi'),
    ];

    const tree = buildSessionTree(entries, 'a1');

    expect(tree.entries.map((entry) => entry.id)).toEqual(['u1', 'a1']);
    expect(tree.entries.find((entry) => entry.id === 'a1')?.parentId).toBe('u1');
  });

  it('keeps several trees in one flat list', () => {
    const entries = [
      userEntry('u1', null, 'first tree'),
      assistantEntry('a1', 'u1', 'answer'),
      userEntry('u2', null, 'second tree'),
    ];

    const tree = buildSessionTree(entries, 'u2');

    expect(
      tree.entries.filter((entry) => entry.parentId === null).map((entry) => entry.id),
    ).toEqual(['u1', 'u2']);
  });

  it('carries the tool arguments from the requesting message onto the result row', () => {
    const entries = [
      userEntry('u1', null, 'run it'),
      assistantEntry('a1', 'u1', 'running', {
        id: 'c1',
        name: 'bash',
        arguments: { command: 'echo hi' },
      }),
      toolResultEntry('r1', 'a1', 'c1'),
    ];

    const row = buildSessionTree(entries, 'r1').entries.find((entry) => entry.id === 'r1');

    expect(row?.kind).toBe('toolResult');
    expect(row?.toolName).toBe('bash');
    expect(row?.toolArgs).toEqual({ command: 'echo hi' });
  });

  it('shows compaction and branch summaries as rows', () => {
    const entries = [
      userEntry('u1', null, 'hello'),
      compactionEntry('c1', 'u1', 'what happened', 42000),
      branchSummaryEntry('b1', 'c1', 'what was left behind'),
    ];

    const tree = buildSessionTree(entries, 'b1');

    expect(tree.entries.map((entry) => `${entry.id}:${entry.kind}`)).toEqual([
      'u1:user',
      'c1:compaction',
      'b1:branchSummary',
    ]);
    expect(tree.entries.find((entry) => entry.id === 'c1')?.tokensBefore).toBe(42000);
  });
});

describe('readEntryText', () => {
  it('reads a message, and answers empty for an unknown entry', () => {
    const entries = [userEntry('u1', null, 'hello there')];

    expect(readEntryText(entries, 'u1')).toEqual({ text: 'hello there', truncated: false });
    expect(readEntryText(entries, 'nope')).toEqual({ text: '', truncated: false });
  });

  it('flags long text as truncated', () => {
    const entries = [userEntry('u1', null, 'x'.repeat(25000))];

    expect(readEntryText(entries, 'u1').truncated).toBe(true);
  });
});
