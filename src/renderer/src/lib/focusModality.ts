/**
 * Chromium matches `:focus-visible` after any keypress without Cmd/Ctrl/Alt
 * (Shift, Escape, typing) until a mouse click moves focus to another element,
 * and also for script focus that follows such a key, e.g. Radix returning focus
 * to a menu trigger. That paints rings on mouse-driven UI. Only Tab and arrow
 * navigation count as keyboard here; focus arriving any other way is marked,
 * and the `focus-visible` variant in main.css skips marked elements.
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

export function installFocusModality(target: Document = document): () => void {
  let navigatingByKeyboard = false;

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey && NAVIGATION_KEYS.has(event.key)) {
      navigatingByKeyboard = true;
    }
  };
  const handlePointerDown = (): void => {
    navigatingByKeyboard = false;
  };
  const handleFocusIn = (event: FocusEvent): void => {
    if (event.target instanceof Element) {
      event.target.toggleAttribute(POINTER_FOCUS_ATTRIBUTE, !navigatingByKeyboard);
    }
  };

  target.addEventListener('keydown', handleKeyDown, true);
  target.addEventListener('pointerdown', handlePointerDown, true);
  target.addEventListener('focusin', handleFocusIn);
  return () => {
    target.removeEventListener('keydown', handleKeyDown, true);
    target.removeEventListener('pointerdown', handlePointerDown, true);
    target.removeEventListener('focusin', handleFocusIn);
  };
}
