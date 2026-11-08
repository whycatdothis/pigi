/**
 * Catalog search for the packages page. The query is debounced, answers are
 * kept per query for the window's lifetime (the catalog changes by the hour,
 * not by the second), and an answer for an older query is dropped. While a new
 * query loads, the previous answer stays on screen instead of a blank list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogPackage } from '../../../shared/piPackages';

const SEARCH_DEBOUNCE_MS = 250;

export interface CatalogState {
  /** The query `packages` answers; it lags the field while a search runs. */
  query: string | null;
  packages: CatalogPackage[] | null;
  loading: boolean;
  error: string | null;
}

const answersByQuery = new Map<string, CatalogPackage[]>();

/** `query` null pauses the search (the field holds a source, not a query). */
export function usePackageCatalog(query: string | null): {
  state: CatalogState;
  retry: () => void;
} {
  const normalized = query?.trim() ?? null;
  const [state, setState] = useState<CatalogState>(() => {
    const cached = normalized === null ? undefined : answersByQuery.get(normalized);
    return {
      query: cached ? normalized : null,
      packages: cached ?? null,
      loading: !cached,
      error: null,
    };
  });
  // Retrying re-runs the effect for the same query.
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (normalized === null) return;
    const request = ++requestRef.current;
    const cached = answersByQuery.get(normalized);
    // A timer even with no delay: the effect body must not set state
    // synchronously (react-hooks/set-state-in-effect).
    const timer = window.setTimeout(
      () => {
        if (cached) {
          setState({ query: normalized, packages: cached, loading: false, error: null });
          return;
        }
        setState((current) => ({ ...current, loading: true, error: null }));
        void window.piApi.searchPiPackageCatalog(normalized).then((result) => {
          if (request !== requestRef.current) return;
          if (!result.success) {
            // The older answer goes too: it would read as this query's results.
            setState({ query: normalized, packages: null, loading: false, error: result.error });
            return;
          }
          answersByQuery.set(normalized, result.packages);
          setState({ query: normalized, packages: result.packages, loading: false, error: null });
        });
      },
      cached ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [normalized, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { state, retry };
}
