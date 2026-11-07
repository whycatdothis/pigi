import { useEffect, useSyncExternalStore } from 'react';
import { onProjectActivity } from './projectActivity';

/**
 * Which paths named in chat are existing files, shared by every message so a
 * transcript asks once per path. Lookups made in the same tick go out as one
 * IPC call per cwd.
 *
 * A miss is forgotten whenever an agent may have written files: a message often
 * names a file before the tool call that creates it.
 */

/** Absolute path of an existing file, or null when the path names none. */
const resolved = new Map<string, string | null>();
const inFlight = new Set<string>();
const queued = new Map<string, Set<string>>();
const listeners = new Set<() => void>();

function cacheKey(cwd: string, path: string): string {
  return `${cwd}\0${path}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function resolveBatch(cwd: string, paths: string[]): Promise<void> {
  const results = await window.piApi.resolveExistingFiles(cwd, paths).catch(() => []);
  paths.forEach((path, index) => {
    const key = cacheKey(cwd, path);
    inFlight.delete(key);
    resolved.set(key, results[index] ?? null);
  });
  notify();
}

function flush(): void {
  const batches = [...queued];
  queued.clear();
  for (const [cwd, paths] of batches) void resolveBatch(cwd, [...paths]);
}

function request(cwd: string, path: string): void {
  const key = cacheKey(cwd, path);
  if (resolved.has(key) || inFlight.has(key)) return;
  inFlight.add(key);
  if (queued.size === 0) queueMicrotask(flush);
  const paths = queued.get(cwd) ?? new Set<string>();
  paths.add(path);
  queued.set(cwd, paths);
}

onProjectActivity(() => {
  let forgot = false;
  for (const [key, value] of resolved) {
    if (value !== null) continue;
    resolved.delete(key);
    forgot = true;
  }
  if (forgot) notify();
});

/**
 * Absolute path of the file `path` names relative to `cwd`, or null while it is
 * unknown or names no file. A null `path` asks nothing.
 */
export function useExistingFile(cwd: string, path: string | null): string | null {
  const key = path === null ? null : cacheKey(cwd, path);
  const value = useSyncExternalStore(subscribe, () => (key === null ? null : resolved.get(key)));
  useEffect(() => {
    if (path !== null && value === undefined) request(cwd, path);
  }, [cwd, path, value]);
  return value ?? null;
}
