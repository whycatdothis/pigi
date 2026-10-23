import { createPersistedSessionMap } from './persistedSessionMap';

/**
 * Draft text for the chat input, keyed by session path, persisted in
 * localStorage so it survives quitting the app (see persistedSessionMap).
 *
 * Drafts live outside the ChatInput component because the new-chat screen and
 * the session view are different branches of the app tree: swapping them
 * unmounts the input, so component-local state (and its refs) would be lost.
 *
 * The new-chat input is keyed by NEW_CHAT_DRAFT_KEY, which can never collide
 * with a session path because no real session path is empty.
 */

export const NEW_CHAT_DRAFT_KEY = '';

const CHAT_DRAFTS_STORAGE_KEY = 'pigi.chatDrafts';

const storedDrafts = createPersistedSessionMap({
  storageKey: CHAT_DRAFTS_STORAGE_KEY,
  // Drafts change on every keystroke.
  saveDelayMs: 800,
  parse: (value) => (typeof value === 'string' && value.trim() !== '' ? value : undefined),
});

const drafts = storedDrafts.load();

export function readChatDraft(key: string): string {
  return drafts.get(key) ?? '';
}

/** Stores `text` as the draft for `key`; whitespace-only text clears it. */
export function writeChatDraft(key: string, text: string): void {
  const empty = text.trim().length === 0;
  if (empty ? !drafts.has(key) : drafts.get(key) === text) {
    return;
  }
  if (empty) {
    drafts.delete(key);
  } else {
    drafts.set(key, text);
  }
  storedDrafts.save(drafts);
}
