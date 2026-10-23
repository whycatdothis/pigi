// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistedSessionMap, PERSISTED_ENTRY_MAX_AGE_MS } from './persistedSessionMap';

const STORAGE_KEY = 'test.persisted';
const DAY_MS = 24 * 60 * 60 * 1000;

function createMap(): ReturnType<typeof createPersistedSessionMap<string>> {
  return createPersistedSessionMap({
    storageKey: STORAGE_KEY,
    saveDelayMs: 100,
    parse: (value) => (typeof value === 'string' ? value : undefined),
  });
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
}

describe('createPersistedSessionMap', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 100 * DAY_MS });
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the latest values once after the delay', () => {
    const map = createMap();
    map.save(new Map([['/a', 'first']]));
    map.save(new Map([['/a', 'second']]));
    vi.advanceTimersByTime(99);
    expect(stored()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(stored()).toEqual({ '/a': { savedAt: Date.now(), value: 'second' } });
  });

  it('moves savedAt only for entries whose value changed', () => {
    const map = createMap();
    map.save(
      new Map([
        ['/a', 'kept'],
        ['/b', 'old'],
      ]),
    );
    vi.advanceTimersByTime(100);
    vi.setSystemTime(101 * DAY_MS);
    map.save(
      new Map([
        ['/a', 'kept'],
        ['/b', 'new'],
      ]),
    );
    vi.advanceTimersByTime(100);
    expect(stored()).toEqual({
      '/a': { savedAt: 100 * DAY_MS + 100, value: 'kept' },
      '/b': { savedAt: 101 * DAY_MS + 100, value: 'new' },
    });
  });

  it('drops expired and malformed entries on load and rewrites storage without them', () => {
    const fresh = Date.now() - PERSISTED_ENTRY_MAX_AGE_MS;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        '/fresh': { savedAt: fresh, value: 'kept' },
        '/expired': { savedAt: fresh - 1, value: 'gone' },
        '/wrong-type': { savedAt: fresh, value: 3 },
        '/no-timestamp': 'bare',
      }),
    );
    expect([...createMap().load()]).toEqual([['/fresh', 'kept']]);
    vi.runAllTimers();
    expect(stored()).toEqual({ '/fresh': { savedAt: fresh, value: 'kept' } });
  });

  it('removes the key once empty and flushes a pending save before unload', () => {
    const map = createMap();
    map.save(new Map([['/a', 'value']]));
    window.dispatchEvent(new Event('beforeunload'));
    expect(stored()).not.toBeNull();
    map.save(new Map());
    vi.runAllTimers();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('loads nothing from missing or malformed JSON', () => {
    expect(createMap().load().size).toBe(0);
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(createMap().load().size).toBe(0);
  });
});
