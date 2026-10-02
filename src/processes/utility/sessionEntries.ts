import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import type { CacheWarmEntry } from '../../shared/ipcContract';

/**
 * Prompt-cache refreshes the SDK ran in the background, in transcript order.
 *
 * Callers pass the entries the current context still contains
 * (`SessionManager.buildContextEntries()`), so refreshes that belong to
 * messages a compaction dropped stay out of the transcript.
 */
export function collectCacheWarmEntries(entries: SessionEntry[]): CacheWarmEntry[] {
  return entries
    .filter((entry) => entry.type === 'usage' && entry.kind === 'cache_warm')
    .map((entry) => ({ id: entry.id, timestamp: entry.timestamp }));
}
