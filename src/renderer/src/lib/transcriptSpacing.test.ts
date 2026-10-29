import { expect, test } from 'vitest';
import type { RenderItem } from './readGrouping';
import { rowShowsActions, rowSpaceFor } from './transcriptSpacing';
import type { TranscriptNode } from '../state/transcriptController';

type NodeItem = Extract<RenderItem, { type: 'node' }>;

function node(role: TranscriptNode['role']): NodeItem {
  // The spacing rules read the role, and for assistant rows whether the row
  // carries thinking and prose.
  return { type: 'node', id: role, node: { role, text: 'answer', thinking: '' } as TranscriptNode };
}

/** An assistant row that is nothing but a thinking card. */
function thinking(): NodeItem {
  return {
    type: 'node',
    id: 'thinking',
    node: { role: 'assistant', text: '', thinking: 'hmm' } as TranscriptNode,
  };
}

/** A reply that opens with its thinking card and continues into prose. */
function thinkingWithProse(): NodeItem {
  return {
    type: 'node',
    id: 'thinking-with-prose',
    node: { role: 'assistant', text: 'answer', thinking: 'hmm' } as TranscriptNode,
  };
}

/** A note delivered by another pi session: a card, not prose. */
function peer(): NodeItem {
  return {
    type: 'node',
    id: 'peer',
    node: { role: 'system', kind: 'peer', text: 'pigi', detail: 'main moved' } as TranscriptNode,
  };
}

const readGroup: RenderItem = { type: 'readGroup', id: 'group', entries: [] };

test('a reply keeps its actions on the last row only', () => {
  const text = node('assistant');
  const tool = node('tool');
  const user = node('user');

  expect(rowShowsActions(undefined)).toBe(true);
  expect(rowShowsActions(user)).toBe(true);
  expect(rowShowsActions(tool)).toBe(false);
  expect(rowShowsActions(text)).toBe(false);
});

test('same kinds sit at their own step, different kinds at the boundary step', () => {
  const text = node('assistant');
  const tool = node('tool');

  expect(rowSpaceFor(text, text, false)).toBe('text');
  expect(rowSpaceFor(tool, tool, false)).toBe('surface');
  expect(rowSpaceFor(readGroup, tool, false)).toBe('surface');
  expect(rowSpaceFor(readGroup, readGroup, false)).toBe('surface');

  expect(rowSpaceFor(text, tool, false)).toBe('kind-change');
  expect(rowSpaceFor(tool, text, false)).toBe('kind-change');
  expect(rowSpaceFor(text, readGroup, false)).toBe('kind-change');
  expect(rowSpaceFor(readGroup, text, false)).toBe('kind-change');
});

test('a thinking card is its own kind against prose and against cards', () => {
  const text = node('assistant');
  const tool = node('tool');
  const thought = thinking();

  expect(rowSpaceFor(thought, tool, false)).toBe('kind-change');
  expect(rowSpaceFor(tool, thought, false)).toBe('kind-change');
  expect(rowSpaceFor(thought, readGroup, false)).toBe('kind-change');
  expect(rowSpaceFor(thought, text, false)).toBe('kind-change');
  expect(rowSpaceFor(text, thought, false)).toBe('kind-change');
  expect(rowSpaceFor(thought, thinking(), false)).toBe('surface');
});

test('a row that starts with thinking and ends in prose takes the step of each edge', () => {
  const tool = node('tool');
  const mixed = thinkingWithProse();

  expect(rowSpaceFor(tool, mixed, false)).toBe('kind-change');
  expect(rowSpaceFor(mixed, tool, false)).toBe('kind-change');
  expect(rowSpaceFor(mixed, node('assistant'), false)).toBe('text');
});

test('turn boundaries keep the action band as their spacing', () => {
  const text = node('assistant');
  const tool = node('tool');
  const user = node('user');

  expect(rowSpaceFor(text, user, true)).toBeUndefined();
  expect(rowSpaceFor(tool, user, true)).toBeUndefined();
  expect(rowSpaceFor(user, text, true)).toBeUndefined();
  expect(rowSpaceFor(text, undefined, true)).toBeUndefined();
  expect(rowSpaceFor(thinking(), user, true)).toBeUndefined();

  // A row that cannot render the band still has to hold its turn boundary.
  expect(rowSpaceFor(readGroup, user, false)).toBe('kind-change');
  expect(rowSpaceFor(readGroup, undefined, false)).toBe('kind-change');
});

test('a peer note is a card for the rows around it', () => {
  const text = node('assistant');
  const tool = node('tool');
  const note = peer();

  expect(rowSpaceFor(tool, note, false)).toBe('surface');
  expect(rowSpaceFor(note, note, false)).toBe('surface');
  expect(rowSpaceFor(text, note, false)).toBe('kind-change');
  expect(rowSpaceFor(note, text, false)).toBe('kind-change');
});
