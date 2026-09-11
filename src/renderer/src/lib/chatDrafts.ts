/**
 * In-memory draft text for the chat input, keyed by session path.
 *
 * Drafts live outside the ChatInput component because the new-chat screen and
 * the session view are different branches of the app tree: swapping them
 * unmounts the input, so component-local state (and its refs) would be lost.
 *
 * The new-chat input is keyed by NEW_CHAT_DRAFT_KEY, which can never collide
 * with a session path because no real session path is empty.
 */

export const NEW_CHAT_DRAFT_KEY = '';

const drafts = new Map<string, string>();

export function readChatDraft(key: string): string {
  return drafts.get(key) ?? '';
}

/** Stores `text` as the draft for `key`; whitespace-only text clears it. */
export function writeChatDraft(key: string, text: string): void {
  if (text.trim().length === 0) {
    drafts.delete(key);
    return;
  }
  drafts.set(key, text);
}
