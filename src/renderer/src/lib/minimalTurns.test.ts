import { expect, test } from 'vitest';
import {
  analyzeTurn,
  analyzeTurns,
  buildTurns,
  shouldShowTimer,
  turnRunEnd,
  type MinimalTurnAnalysis,
} from './minimalTurns';
import type {
  AgentStatus,
  AssistantNode,
  SystemNode,
  ToolNode,
  TranscriptNode,
  UserNode,
} from '../state/transcriptController';

function user(text: string, sentAt = 1_000): UserNode {
  return { id: `user-${text}`, role: 'user', text, sentAt };
}

function assistant(overrides: Partial<AssistantNode> & { text: string }): AssistantNode {
  return { id: 'assistant', role: 'assistant', thinking: '', isStreaming: false, ...overrides };
}

function runningTool(startedAt: number): ToolNode {
  return {
    id: 'tool',
    role: 'tool',
    toolCallId: 'call-1',
    name: 'bash',
    args: {},
    status: 'running',
    output: '',
    isError: false,
    startedAt,
  };
}

function analysisFor(
  nodes: TranscriptNode[],
  status: AgentStatus = 'streaming',
): MinimalTurnAnalysis {
  const turns = buildTurns(nodes);
  return analyzeTurn(turns[turns.length - 1], status, true);
}

test('an ordinary prompt starts its timer as soon as it is sent', () => {
  const analysis = analysisFor([user('hello')]);

  expect(analysis.isActive).toBe(true);
  expect(analysis.startAt).toBe(1_000);
  expect(shouldShowTimer(analysis)).toBe(true);
});

test('an extension command does not start a timer before the agent does any work', () => {
  const analysis = analysisFor([user('/plannotator-review')]);

  expect(analysis.isActive).toBe(false);
  expect(analysis.startAt).toBeUndefined();
  expect(shouldShowTimer(analysis)).toBe(false);
});

test('a skill invocation is a command too', () => {
  const skill = [
    '<skill name="plannotator-review" location="/skills/plannotator/SKILL.md">',
    'Review the current changes.',
    '</skill>',
  ].join('\n');
  const analysis = analysisFor([user(skill)]);

  expect(analysis.isActive).toBe(false);
  expect(analysis.startAt).toBeUndefined();
  expect(shouldShowTimer(analysis)).toBe(false);
});

test('a command timer starts with the first agent node, not with the prompt', () => {
  const analysis = analysisFor(
    [
      user('/skill:review', 1_000),
      assistant({
        text: 'done',
        messageStartedAt: 5_000,
        messageEndedAt: 7_000,
        thinkingStartedAt: 5_000,
        thinkingEndedAt: 5_000,
        stopReason: 'endTurn',
      }),
    ],
    'idle',
  );

  expect(analysis.startAt).toBe(5_000);
  expect(analysis.endAt).toBe(7_000);
  expect(shouldShowTimer(analysis)).toBe(true);
});

test('a command turn counts its own agent work while it is still running', () => {
  const analysis = analysisFor([user('/review', 1_000), runningTool(3_000)], 'tool_running');

  expect(analysis.isActive).toBe(true);
  expect(analysis.startAt).toBe(3_000);
  expect(shouldShowTimer(analysis)).toBe(true);
});

function peer(continuesUserTurn: boolean): SystemNode {
  return {
    id: 'peer',
    role: 'system',
    kind: 'custom',
    text: 'pigi',
    detail: 'a note',
    continuesUserTurn,
  };
}

test('a steered peer note stays inside the turn, an opening one starts a turn', () => {
  const inside = buildTurns([
    user('hello'),
    peer(true),
    assistant({ text: 'done', isStreaming: true }),
  ]);
  expect(inside).toHaveLength(1);
  expect(inside[0].entries).toContainEqual(expect.objectContaining({ kind: 'custom' }));

  const boundary = buildTurns([user('hello'), peer(false), assistant({ text: 'done' })]);
  expect(boundary).toHaveLength(3);
  expect(boundary[1].entries[0]).toMatchObject({ kind: 'custom' });
});

test('a finished run ends on its last message, timed from the prompt', () => {
  const reply = assistant({ text: 'done', messageStartedAt: 2_000, messageEndedAt: 61_000 });
  const turn = buildTurns([user('go', 1_000), reply])[0];

  expect(turnRunEnd(turn, analyzeTurn(turn, 'idle', true))).toEqual({
    node: reply,
    endedAt: 61_000,
    durationMs: 60_000,
  });
  expect(turnRunEnd(turn, analyzeTurn(turn, 'streaming', true))).toBeNull();
});

test('history keeps its turn and analysis across a streaming batch', () => {
  const first = user('first', 1_000);
  const firstReply = assistant({ text: 'one', messageStartedAt: 2_000, messageEndedAt: 3_000 });
  const second = user('second', 10_000);
  const live = assistant({ text: 't', isStreaming: true, messageStartedAt: 11_000 });

  const before = buildTurns([first, firstReply, second, live]);
  const beforeAnalyses = analyzeTurns(before, 'streaming');

  // The utility process replaces the tail node on every batch, nothing else.
  const streamedLive = { ...live, text: 'two' };
  const after = buildTurns([first, firstReply, second, streamedLive]);
  const afterAnalyses = analyzeTurns(after, 'streaming');

  expect(after[0]).toBe(before[0]);
  expect(afterAnalyses[0]).toBe(beforeAnalyses[0]);
  expect(after[1]).not.toBe(before[1]);
  expect(afterAnalyses[1]).not.toBe(beforeAnalyses[1]);
});

test('streaming text mutated in place rebuilds the live turn', () => {
  // applyStreamBatch mutates the active assistant node in place and bumps its
  // revision (see readGrouping.ts); the node reference never changes.
  const first = user('first', 1_000);
  const reply = assistant({ text: 'one', messageStartedAt: 2_000, messageEndedAt: 3_000 });
  const second = user('second', 10_000);
  const live = assistant({ text: 'a', isStreaming: true, messageStartedAt: 11_000 });

  const before = buildTurns([first, reply, second, live]);
  const beforeAnalyses = analyzeTurns(before, 'streaming');

  live.text += 'b';
  live.revision = 1;

  const after = buildTurns([first, reply, second, live]);
  const afterAnalyses = analyzeTurns(after, 'streaming');

  expect(after[0]).toBe(before[0]);
  expect(afterAnalyses[0]).toBe(beforeAnalyses[0]);
  expect(after[1]).not.toBe(before[1]);
  expect(afterAnalyses[1]).not.toBe(beforeAnalyses[1]);
});

test('a status flip does not recompute the finished turns', () => {
  const nodes = [
    user('first', 1_000),
    assistant({ text: 'one', messageStartedAt: 2_000, messageEndedAt: 3_000 }),
    user('second', 10_000),
  ];
  const turns = buildTurns(nodes);

  const streaming = analyzeTurns(turns, 'streaming');
  const idle = analyzeTurns(turns, 'idle');

  expect(idle[0]).toBe(streaming[0]);
  expect(idle[1]).not.toBe(streaming[1]);
});
