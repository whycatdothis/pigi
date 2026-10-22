// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFocusModality, POINTER_FOCUS_ATTRIBUTE } from './focusModality';

describe('installFocusModality', () => {
  let uninstall: () => void;
  let first: HTMLButtonElement;
  let second: HTMLButtonElement;

  beforeEach(() => {
    uninstall = installFocusModality();
    first = document.createElement('button');
    second = document.createElement('button');
    document.body.append(first, second);
  });

  afterEach(() => {
    uninstall();
    document.body.replaceChildren();
  });

  const press = (key: string, init: KeyboardEventInit = {}): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  };

  it('marks focus that follows a pointer press', () => {
    document.dispatchEvent(new Event('pointerdown'));
    first.focus();
    expect(first.hasAttribute(POINTER_FOCUS_ATTRIBUTE)).toBe(true);
  });

  it('leaves focus unmarked after Tab or arrow navigation', () => {
    press('Tab');
    first.focus();
    expect(first.hasAttribute(POINTER_FOCUS_ATTRIBUTE)).toBe(false);

    document.dispatchEvent(new Event('pointerdown'));
    press('ArrowDown');
    second.focus();
    expect(second.hasAttribute(POINTER_FOCUS_ATTRIBUTE)).toBe(false);
  });

  it('ignores non-navigation keys and modified navigation keys', () => {
    document.dispatchEvent(new Event('pointerdown'));
    press('Shift');
    press('Escape');
    press('Tab', { metaKey: true });
    first.focus();
    expect(first.hasAttribute(POINTER_FOCUS_ATTRIBUTE)).toBe(true);
  });

  it('clears the mark when the element is later reached by keyboard', () => {
    document.dispatchEvent(new Event('pointerdown'));
    first.focus();
    second.focus();
    press('Tab');
    first.focus();
    expect(first.hasAttribute(POINTER_FOCUS_ATTRIBUTE)).toBe(false);
  });
});
