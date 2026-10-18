import fuzzysort from 'fuzzysort';

const CACHE_TTL_MS = 5000;
const MAX_MATCHES = 20;

interface CacheEntry {
  loadedAt: number;
  files: string[];
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string[]>>();

/**
 * Files the composer can reference with `@`. Backed by `git ls-files`, so the
 * list respects .gitignore and stays cheap on large repositories.
 */
export async function loadProjectFiles(cwd: string): Promise<string[]> {
  if (!cwd) return [];

  const cached = cache.get(cwd);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.files;
  }

  const pending = inFlight.get(cwd);
  if (pending) return pending;

  const request = window.piApi
    .listProjectFiles(cwd)
    .then((result) => {
      const files = result.success ? [...result.files].sort() : [];
      cache.set(cwd, { loadedAt: Date.now(), files });
      return files;
    })
    .catch(() => [])
    .finally(() => {
      inFlight.delete(cwd);
    });

  inFlight.set(cwd, request);
  return request;
}

/** Rank paths against the mention query; an empty query shows the first paths. */
export function rankProjectFiles(files: string[], query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return files.slice(0, MAX_MATCHES);

  return fuzzysort
    .go(trimmed, files, { limit: MAX_MATCHES, threshold: -10000 })
    .map((result) => result.target);
}
