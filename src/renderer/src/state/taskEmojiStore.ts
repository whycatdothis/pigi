/**
 * The task emoji picker's palette. App-global and cosmetic, so it lives in
 * localStorage next to `pigi.expandedProjects`, not in the file-backed
 * settings main owns.
 */
import { create } from 'zustand';

const STORAGE_KEY = 'pigi.taskEmojis';
/** ZWJ sequences and keycaps run long; 16 code units still fit any single emoji. */
const MAX_EMOJI_LENGTH = 16;

/** The palette a fresh install starts with: work-flavored, no duplicate themes. */
export const DEFAULT_TASK_EMOJIS: string[] = [
  '📋',
  '🎯',
  '🚀',
  '🐛',
  '✨',
  '🔥',
  '💡',
  '🧪',
  '🎨',
  '🔧',
  '📦',
  '🗂️',
  '📝',
  '🏗️',
  '🚧',
  '✅',
  '🧹',
  '🔍',
  '💼',
  '🌱',
];

/** One palette entry: visible glyphs only, short enough to be a single emoji. */
export function isValidTaskEmoji(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EMOJI_LENGTH && !/\s/.test(value);
}

function loadEmojis(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!Array.isArray(parsed)) return DEFAULT_TASK_EMOJIS;
    const valid = parsed.filter(
      (item): item is string => typeof item === 'string' && isValidTaskEmoji(item),
    );
    return [...new Set(valid)];
  } catch {
    return DEFAULT_TASK_EMOJIS;
  }
}

interface TaskEmojiState {
  emojis: string[];
  addEmoji: (emoji: string) => void;
  removeEmoji: (emoji: string) => void;
  moveEmoji: (from: number, to: number) => void;
}

export const useTaskEmojiStore = create<TaskEmojiState>((set, get) => {
  const commit = (emojis: string[]): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emojis));
    set({ emojis });
  };
  return {
    emojis: loadEmojis(),
    addEmoji: (emoji) => {
      const value = emoji.trim();
      if (!isValidTaskEmoji(value) || get().emojis.includes(value)) return;
      commit([...get().emojis, value]);
    },
    removeEmoji: (emoji) => {
      commit(get().emojis.filter((item) => item !== emoji));
    },
    moveEmoji: (from, to) => {
      const current = get().emojis;
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) {
        return;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      commit(next);
    },
  };
});
