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

  expect(rowSpaceFor(text, text)).toBe('block');
  expect(rowSpaceFor(text, tool)).toBe('edge');
  expect(rowSpaceFor(tool, text)).toBe('edge');
  expect(rowSpaceFor(tool, tool)).toBe('block');
  expect(rowSpaceFor(text, readGroup)).toBe('edge');
  expect(rowSpaceFor(readGroup, readGroup)).toBe('block');
});

test('turn boundaries keep the action band as their spacing', () => {
  const text = node('assistant');
  const tool = node('tool');
  const user = node('user');

  expect(rowSpaceFor(text, user)).toBeUndefined();
  expect(rowSpaceFor(tool, user)).toBeUndefined();
  expect(rowSpaceFor(user, text)).toBeUndefined();
  expect(rowSpaceFor(text, undefined)).toBeUndefined();
});
