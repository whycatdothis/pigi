import { expect, test } from 'vitest';
import type { RenderItem } from './readGrouping';
import { rowShowsActions, rowSpaceFor } from './transcriptSpacing';
import type { TranscriptNode } from '../state/transcriptController';

function node(role: TranscriptNode['role']): Extract<RenderItem, { type: 'node' }> {
  // The spacing rules only read the role, so the rest of the node is irrelevant.
  return { type: 'node', id: role, node: { role } as TranscriptNode };
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

test('mid-reply rows carry the block rhythm, tool adjacency widens it', () => {
  const text = node('assistant');
  const tool = node('tool');

  expect(rowSpaceFor(text, text, false)).toBe('block');
  expect(rowSpaceFor(text, tool, false)).toBe('edge');
  expect(rowSpaceFor(tool, text, false)).toBe('edge');
  expect(rowSpaceFor(text, readGroup, false)).toBe('edge');
  expect(rowSpaceFor(readGroup, tool, false)).toBe('pair');
  expect(rowSpaceFor(tool, tool, false)).toBe('pair');
  expect(rowSpaceFor(readGroup, readGroup, false)).toBe('pair');
});

test('turn boundaries keep the action band as their spacing', () => {
  const text = node('assistant');
  const tool = node('tool');
  const user = node('user');

  expect(rowSpaceFor(text, user, true)).toBeUndefined();
  expect(rowSpaceFor(tool, user, true)).toBeUndefined();
  expect(rowSpaceFor(user, text, true)).toBeUndefined();
  expect(rowSpaceFor(text, undefined, true)).toBeUndefined();

  // A row that cannot render the band still has to hold its turn boundary.
  expect(rowSpaceFor(readGroup, user, false)).toBe('edge');
  expect(rowSpaceFor(readGroup, undefined, false)).toBe('edge');
});
