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

  /** Key press; `whileDown` runs between keydown and keyup, like a focus move. */
  const press = (
    key: string,
    whileDown: () => void = () => {},
    init: KeyboardEventInit = {},
    on: EventTarget = document,
  ): void => {
    on.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    whileDown();
    on.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ...init }));
  };
  const pointerDown = (): void => {
    document.dispatchEvent(new Event('pointerdown'));
  };
  const isMarked = (element: Element): boolean => element.hasAttribute(POINTER_FOCUS_ATTRIBUTE);

  it('marks focus that follows a pointer press', () => {
    pointerDown();
    first.focus();
    expect(isMarked(first)).toBe(true);
  });

  it('leaves focus moved by Tab or arrow keys unmarked, and keeps that mode', () => {
    press('Tab', () => first.focus());
    expect(isMarked(first)).toBe(false);

    pointerDown();
    press('ArrowDown', () => second.focus());
    expect(isMarked(second)).toBe(false);

    // Later script focus, e.g. a dialog opened with Enter, still shows the ring.
    press('Enter');
    first.focus();
    expect(isMarked(first)).toBe(false);
  });

  it('ignores non-navigation keys and modified navigation keys', () => {
    pointerDown();
    press('Shift');
    press('Escape');
    press('Tab', () => second.focus(), { metaKey: true });
    first.focus();
    expect(isMarked(second)).toBe(true);
    expect(isMarked(first)).toBe(true);
  });

  it('ignores navigation keys that do not move focus', () => {
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    pointerDown();
    textarea.focus();
    // Caret moves and a Tab-accepted completion keep focus in the field.
    press('ArrowLeft', undefined, {}, textarea);
    press('End', undefined, {}, textarea);
    press('Tab', undefined, {}, textarea);
    first.focus();
    expect(isMarked(first)).toBe(true);
  });

  it('never marks text fields', () => {
    const input = document.createElement('input');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.append(input, checkbox);
    pointerDown();
    input.focus();
    expect(isMarked(input)).toBe(false);
    checkbox.focus();
    expect(isMarked(checkbox)).toBe(true);
  });

  it('clears the mark when the element is later reached by keyboard', () => {
    pointerDown();
    first.focus();
    second.focus();
    press('Tab', () => first.focus());
    expect(isMarked(first)).toBe(false);
  });
});
