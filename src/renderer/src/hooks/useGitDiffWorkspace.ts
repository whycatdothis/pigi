import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitDiffSummary } from '../../../shared/ipcContract';
import { getGitDiffSummary } from '../services/piAgentClient';

export const GIT_DIFF_VIEWS = ['tree', 'status', 'commits'] as const;
export type GitDiffView = (typeof GIT_DIFF_VIEWS)[number];

export interface GitDiffWorkspace {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: GitDiffSummary | null;
  base: string | null;
  selectedPath: string | null;
  view: GitDiffView;
  selectBase: (base: string) => void;
  resetBase: () => void;
  selectFile: (path: string) => void;
  setView: (view: GitDiffView) => void;
  refresh: () => void;
}

/**
 * The Diff tab's comparison state. The selected base is deliberately not
 * persisted: switching projects should start from that project's upstream,
 * not from a ref that may not exist there.
 */
export function useGitDiffWorkspace({
  cwd,
  enabled,
}: {
  cwd: string | null;
  enabled: boolean;
}): GitDiffWorkspace {
  const [summary, setSummary] = useState<GitDiffSummary | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [requestedBase, setRequestedBase] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [view, setView] = useState<GitDiffView>('tree');
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    // Deferred so the effect body does not set state synchronously, which the
    // react-hooks/set-state-in-effect rule rejects.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSummary(null);
      setError(null);
      setStatus('idle');
      setRequestedBase(null);
      setSelectedPath(null);
      setView('tree');
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    if (!enabled || !cwd) return;
    let cancelled = false;
    const id = ++requestId.current;
    // Deferred so the effect body does not set state synchronously, which the
    // react-hooks/set-state-in-effect rule rejects.
    queueMicrotask(() => {
      if (cancelled) return;
      setStatus('loading');
      setError(null);

      getGitDiffSummary(cwd, requestedBase)
        .then((result) => {
          if (cancelled || id !== requestId.current) return;
          if (!result.success) {
            setSummary(null);
            setStatus('error');
            setError(result.error);
            return;
          }
          setSummary(result.summary);
          setSelectedPath((previous) =>
            previous && result.summary.files.some((file) => file.path === previous)
              ? previous
              : (result.summary.files[0]?.path ?? null),
          );
          setStatus('ready');
        })
        .catch(() => {
          if (cancelled || id !== requestId.current) return;
          setSummary(null);
          setStatus('error');
          setError('Unable to read this diff.');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, enabled, requestedBase, revision]);

  const beginSelection = useCallback(() => {
    setSelectedPath(null);
    setStatus('loading');
    setError(null);
  }, []);

  const selectBase = useCallback(
    (base: string) => {
      setRequestedBase(base);
      setRevision((value) => value + 1);
      beginSelection();
    },
    [beginSelection],
  );

  const resetBase = useCallback(() => {
    setRequestedBase(null);
    setRevision((value) => value + 1);
    beginSelection();
  }, [beginSelection]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  return {
    status,
    error,
    summary,
    base: summary?.base ?? requestedBase,
    selectedPath,
    view,
    selectBase,
    resetBase,
    selectFile: setSelectedPath,
    setView,
    refresh,
  };
}
