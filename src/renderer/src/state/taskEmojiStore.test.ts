// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TASK_EMOJIS, isValidTaskEmoji, useTaskEmojiStore } from './taskEmojiStore';

const STORAGE_KEY = 'pigi.taskEmojis';

function readStored(): string[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as string[];
}

beforeEach(() => {
  localStorage.clear();
  useTaskEmojiStore.setState({ emojis: [...DEFAULT_TASK_EMOJIS] });
});

describe('isValidTaskEmoji', () => {
  it('accepts single and compound emoji, rejects junk', () => {
    expect(isValidTaskEmoji('🚀')).toBe(true);
    expect(isValidTaskEmoji('👨‍👩‍👧‍👦')).toBe(true);
    expect(isValidTaskEmoji('❤️')).toBe(true);
    expect(isValidTaskEmoji('')).toBe(false);
    expect(isValidTaskEmoji('a b')).toBe(false);
    expect(isValidTaskEmoji('x'.repeat(17))).toBe(false);
  });
});

describe('addEmoji', () => {
  it('appends a new emoji and persists it', () => {
    useTaskEmojiStore.getState().addEmoji('🦄');
    expect(useTaskEmojiStore.getState().emojis.at(-1)).toBe('🦄');
    expect(readStored().at(-1)).toBe('🦄');
  });

  it('ignores duplicates and invalid input', () => {
    const before = useTaskEmojiStore.getState().emojis;
    useTaskEmojiStore.getState().addEmoji(before[0]);
    useTaskEmojiStore.getState().addEmoji('has space');
    useTaskEmojiStore.getState().addEmoji('   ');
    expect(useTaskEmojiStore.getState().emojis).toEqual(before);
    // Nothing committed, so nothing was written either.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('removeEmoji', () => {
  it('deletes the emoji and persists', () => {
    useTaskEmojiStore.getState().removeEmoji('🚀');
    expect(useTaskEmojiStore.getState().emojis).not.toContain('🚀');
    expect(readStored()).not.toContain('🚀');
  });

  it('can empty the palette, and empty stays empty', () => {
    for (const emoji of [...useTaskEmojiStore.getState().emojis]) {
      useTaskEmojiStore.getState().removeEmoji(emoji);
    }
    expect(useTaskEmojiStore.getState().emojis).toEqual([]);
    expect(readStored()).toEqual([]);
  });
});

describe('moveEmoji', () => {
  it('reorders and persists', () => {
    useTaskEmojiStore.getState().moveEmoji(0, 2);
    expect(useTaskEmojiStore.getState().emojis.slice(0, 3)).toEqual(['🎯', '🚀', '📋']);
    expect(readStored().slice(0, 3)).toEqual(['🎯', '🚀', '📋']);
  });

  it('ignores out-of-range and no-op moves', () => {
    const before = useTaskEmojiStore.getState().emojis;
    useTaskEmojiStore.getState().moveEmoji(0, 0);
    useTaskEmojiStore.getState().moveEmoji(-1, 2);
    useTaskEmojiStore.getState().moveEmoji(2, before.length);
    expect(useTaskEmojiStore.getState().emojis).toEqual(before);
  });
});

describe('loadEmojis', () => {
  // Module-init reads storage once; a fresh module simulates a cold start.
  it('falls back to defaults on corrupt or non-list storage', async () => {
    localStorage.setItem(STORAGE_KEY, '{nope');
    vi.resetModules();
    let fresh = await import('./taskEmojiStore');
    expect(fresh.useTaskEmojiStore.getState().emojis).toEqual(DEFAULT_TASK_EMOJIS);

    localStorage.setItem(STORAGE_KEY, '{"a":1}');
    vi.resetModules();
    fresh = await import('./taskEmojiStore');
    expect(fresh.useTaskEmojiStore.getState().emojis).toEqual(DEFAULT_TASK_EMOJIS);
  });

  it('drops invalid entries but keeps a user-emptied list empty', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['🚀', 'bad entry', 42, '🚀', '🌱']));
    vi.resetModules();
    let fresh = await import('./taskEmojiStore');
    expect(fresh.useTaskEmojiStore.getState().emojis).toEqual(['🚀', '🌱']);

    localStorage.setItem(STORAGE_KEY, '[]');
    vi.resetModules();
    fresh = await import('./taskEmojiStore');
    expect(fresh.useTaskEmojiStore.getState().emojis).toEqual([]);
  });
});
