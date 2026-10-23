/** Entries untouched for longer than this are dropped when loading. */
export const PERSISTED_ENTRY_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

interface StoredEntry {
  savedAt: number;
  value: unknown;
}

function isStoredEntry(value: unknown): value is StoredEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'savedAt' in value &&
    typeof value.savedAt === 'number' &&
    'value' in value
  );
}

export interface PersistedSessionMap<T> {
  /** The stored entries younger than PERSISTED_ENTRY_MAX_AGE_MS that `parse` accepts. */
  load: () => Map<string, T>;
  /** Persist `values` once `saveDelayMs` passes without another call. */
  save: (values: ReadonlyMap<string, T>) => void;
}

/**
 * A per-session map persisted in localStorage as
 * `{ [sessionPath]: { savedAt, value } }`. `savedAt` moves only when that
 * session's value changes, so the store itself stays a plain Map and old
 * entries (of deleted or abandoned sessions) expire without any bookkeeping.
 *
 * localStorage writes block the renderer's main thread, so saves are
 * debounced; a pending save is flushed before the page unloads (window
 * close, quit, reload).
 */
export function createPersistedSessionMap<T>({
  storageKey,
  saveDelayMs,
  parse,
}: {
  storageKey: string;
  saveDelayMs: number;
  /** The value of one stored entry, or undefined to drop it. */
  parse: (value: unknown) => T | undefined;
}): PersistedSessionMap<T> {
  // What was last written per session, to tell changed values from unchanged.
  const written = new Map<string, { savedAt: number; json: string }>();
  let pending: ReadonlyMap<string, T> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (pending === null) {
      return;
    }
    const values = pending;
    pending = null;
    const now = Date.now();
    const stored: Record<string, StoredEntry> = {};
    for (const [sessionPath, value] of values) {
      const json = JSON.stringify(value);
      const previous = written.get(sessionPath);
      const savedAt = previous?.json === json ? previous.savedAt : now;
      written.set(sessionPath, { savedAt, json });
      stored[sessionPath] = { savedAt, value };
    }
    for (const sessionPath of written.keys()) {
      if (!values.has(sessionPath)) {
        written.delete(sessionPath);
      }
    }
    try {
      if (values.size > 0) {
        localStorage.setItem(storageKey, JSON.stringify(stored));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      // Typically over quota. Drop the last good value rather than keep it:
      // restoring it later would bring back deleted entries and lose new ones.
      console.error(`Failed to save ${storageKey}:`, error);
      localStorage.removeItem(storageKey);
    }
  };

  const save = (values: ReadonlyMap<string, T>): void => {
    pending = values;
    clearTimeout(timer);
    timer = setTimeout(flush, saveDelayMs);
  };

  window.addEventListener('beforeunload', flush);

  return {
    load: () => {
      const values = new Map<string, T>();
      let stored: unknown;
      try {
        stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      } catch {
        return values;
      }
      if (typeof stored !== 'object' || stored === null) {
        return values;
      }
      const oldest = Date.now() - PERSISTED_ENTRY_MAX_AGE_MS;
      const entries = Object.entries(stored);
      for (const [sessionPath, entry] of entries) {
        if (!isStoredEntry(entry) || entry.savedAt < oldest) {
          continue;
        }
        const value = parse(entry.value);
        if (value !== undefined) {
          values.set(sessionPath, value);
          written.set(sessionPath, { savedAt: entry.savedAt, json: JSON.stringify(value) });
        }
      }
      // Rewrite without the dropped entries, even if nothing changes later.
      if (values.size < entries.length) {
        save(values);
      }
      return values;
    },
    save,
  };
}
