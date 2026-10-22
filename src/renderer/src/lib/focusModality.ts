/**
 * Chromium matches `:focus-visible` after any keypress without Cmd/Ctrl/Alt
 * (Shift, Escape, typing) until a mouse click moves focus to another element,
 * and also for script focus that follows such a key, e.g. Radix returning focus
 * to a menu trigger. That paints rings on mouse-driven UI. Here only a Tab,
 * arrow or Home/End press that actually moves focus counts as keyboard (caret
 * moves and Tab-accepted completions do not); focus arriving any other way is
 * marked, and the `focus-visible` variant in main.css skips marked elements.
 * Text fields keep Chromium's rule (always focus-visible), like native text
 * fields.
 */
export const POINTER_FOCUS_ATTRIBUTE = 'data-pointer-focus';

const NAVIGATION_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

export function installFocusModality(target: Document = document): () => void {
  let navigatingByKeyboard = false;
  // Radix moves focus inside its keydown handler and the browser's Tab move
  // happens before keyup, so focus that changes while this is set came from
  // the navigation key.
  let navigationKeyDown = false;

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey && NAVIGATION_KEYS.has(event.key)) {
      navigationKeyDown = true;
    }
  };
  const handleKeyUp = (): void => {
    navigationKeyDown = false;
  };
  const handlePointerDown = (): void => {
    navigatingByKeyboard = false;
    navigationKeyDown = false;
  };
  const handleFocusIn = (event: FocusEvent): void => {
    if (navigationKeyDown) {
      navigatingByKeyboard = true;
    }
    if (event.target instanceof Element) {
      event.target.toggleAttribute(
        POINTER_FOCUS_ATTRIBUTE,
        !navigatingByKeyboard && !isTextField(event.target),
      );
    }
  };

  target.addEventListener('keydown', handleKeyDown, true);
  target.addEventListener('keyup', handleKeyUp, true);
  target.addEventListener('pointerdown', handlePointerDown, true);
  target.addEventListener('focusin', handleFocusIn);
  return () => {
    target.removeEventListener('keydown', handleKeyDown, true);
    target.removeEventListener('keyup', handleKeyUp, true);
    target.removeEventListener('pointerdown', handlePointerDown, true);
    target.removeEventListener('focusin', handleFocusIn);
  };
}
