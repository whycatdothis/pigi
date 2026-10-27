/**
 * The key a shortcut binding stores, derived from a keyboard event.
 *
 * One function for both ends: the recorder writes what this returns and the
 * global handler compares against the same string. Two copies of this mapping
 * drift, and the symptom — a shortcut that records fine and never fires — looks
 * like a registration bug rather than a spelling one.
 */

/** Shift turns the bracket keys into braces; bindings keep the unshifted label. */
const SHIFTED_BRACKET_KEYS: Record<string, string> = { '{': '[', '}': ']' };

export function shortcutKeyFromEvent(event: KeyboardEvent): string {
  const key = event.shiftKey ? (SHIFTED_BRACKET_KEYS[event.key] ?? event.key) : event.key;
  return key.length === 1 ? key.toLowerCase() : key;
}
