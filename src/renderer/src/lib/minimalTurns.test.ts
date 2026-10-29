import { expect, test } from 'vitest';
import { analyzeTurn, buildTurns, shouldShowTimer, type MinimalTurnAnalysis } from './minimalTurns';
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
    kind: 'peer',
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
  expect(inside[0].entries).toContainEqual(expect.objectContaining({ kind: 'peer' }));

  const boundary = buildTurns([user('hello'), peer(false), assistant({ text: 'done' })]);
  expect(boundary).toHaveLength(3);
  expect(boundary[1].entries[0]).toMatchObject({ kind: 'peer' });
});
