/**
 * The installed side of the packages page: the list, its slow health check,
 * and the one package operation that may run at a time.
 *
 * Every request spawns a package worker, so the list takes a moment; the last
 * one per project is kept for this window's lifetime and shown while the fresh
 * one loads. The operation lives outside the page, which can close and reopen
 * while npm is still running.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type {
  PiExtensionLoadError,
  PiPackageOperation,
  PiPackagesHealth,
  PiPackagesSnapshot,
} from '../../../shared/piPackages';

export type PackageActivity =
  | { status: 'running'; operation: PiPackageOperation; startedAt: number }
  | { status: 'failed'; operation: PiPackageOperation; error: string; log: string };

const usePackageActivity = create<{
  activity: PackageActivity | null;
  /** Bumped when an operation succeeds, so every open page reloads its list. */
  completed: number;
}>(() => ({ activity: null, completed: 0 }));

export interface PiPackagesController {
  snapshot: PiPackagesSnapshot | null;
  listError: string | null;
  health: PiPackagesHealth | null;
  activity: PackageActivity | null;
  reload: () => void;
  /** Resolves the package's load errors on success; a failure stays in `activity` and resolves null. */
  run: (operation: PiPackageOperation) => Promise<PiExtensionLoadError[] | null>;
  dismissActivity: () => void;
}

const lastSnapshotByCwd = new Map<string, PiPackagesSnapshot>();
const lastHealthByCwd = new Map<string, PiPackagesHealth>();

export function usePiPackages(cwd: string | null): PiPackagesController {
  const cacheKey = cwd ?? '';
  const [snapshot, setSnapshot] = useState(() => lastSnapshotByCwd.get(cacheKey) ?? null);
  const [health, setHealth] = useState(() => lastHealthByCwd.get(cacheKey) ?? null);
  const [listError, setListError] = useState<string | null>(null);
  const activity = usePackageActivity((state) => state.activity);
  const completed = usePackageActivity((state) => state.completed);
  // A list or check that lands after a newer one started is dropped.
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const result = await window.piApi.listPiPackages(cwd);
    if (token !== loadTokenRef.current) return;
    if (!result.success) {
      setListError(result.error);
      return;
    }
    lastSnapshotByCwd.set(cacheKey, result.snapshot);
    setSnapshot(result.snapshot);
    setListError(null);
    const check = await window.piApi.checkPiPackages(cwd);
    if (token !== loadTokenRef.current || !check.success) return;
    lastHealthByCwd.set(cacheKey, check.health);
    setHealth(check.health);
  }, [cacheKey, cwd]);

  useEffect(() => {
    // A microtask keeps the effect body free of synchronous setState (the
    // react-hooks/set-state-in-effect rule), as usePiSettings does.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load, completed]);

  const run = useCallback(
    async (operation: PiPackageOperation): Promise<PiExtensionLoadError[] | null> => {
      usePackageActivity.setState({
        activity: { status: 'running', operation, startedAt: Date.now() },
      });
      const result = await window.piApi.runPiPackageOperation(cwd, operation);
      if (!result.success) {
        usePackageActivity.setState({
          activity: { status: 'failed', operation, error: result.error, log: result.log },
        });
        return null;
      }
      // The update check takes seconds; until it answers, the cached one
      // still offers the update that just ran.
      if (operation.action !== 'install') {
        const cached = lastHealthByCwd.get(cacheKey);
        if (cached) {
          const next = {
            ...cached,
            updates: cached.updates.filter((source) => source !== operation.source),
          };
          lastHealthByCwd.set(cacheKey, next);
          setHealth(next);
        }
      }
      usePackageActivity.setState((state) => ({ activity: null, completed: state.completed + 1 }));
      return result.loadErrors;
    },
    [cacheKey, cwd],
  );

  const reload = useCallback(() => void load(), [load]);
  const dismissActivity = useCallback(() => usePackageActivity.setState({ activity: null }), []);

  return { snapshot, listError, health, activity, reload, run, dismissActivity };
}
