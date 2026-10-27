// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { shortcutKeyFromEvent } from './shortcutKey';

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

test('single characters read as their unshifted lowercase key', () => {
  expect(shortcutKeyFromEvent(keyEvent({ key: 'J' }))).toBe('j');
  expect(shortcutKeyFromEvent(keyEvent({ key: '{', shiftKey: true }))).toBe('[');
  expect(shortcutKeyFromEvent(keyEvent({ key: '}', shiftKey: true }))).toBe(']');
  expect(shortcutKeyFromEvent(keyEvent({ key: '[' }))).toBe('[');
});

test('named keys keep their name', () => {
  expect(shortcutKeyFromEvent(keyEvent({ key: 'Enter' }))).toBe('Enter');
  expect(shortcutKeyFromEvent(keyEvent({ key: 'Tab' }))).toBe('Tab');
  expect(shortcutKeyFromEvent(keyEvent({ key: 'ArrowUp' }))).toBe('ArrowUp');
});
