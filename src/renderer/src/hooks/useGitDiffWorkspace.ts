import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitDiffFile, GitDiffSummary } from '../../../shared/ipcContract';
import { getGitCommitFiles, getGitDiffSummary } from '../services/piAgentClient';

export type GitDiffView = 'tree' | 'status' | 'commits';
export type GitDiffLayout = 'unified' | 'split';

/** A file in the base comparison (`commit: null`) or in one commit. */
export interface GitDiffSelection {
  commit: string | null;
  path: string;
}

export type GitCommitFiles =
  | { status: 'loading' }
  | { status: 'ready'; files: GitDiffFile[] }
  | { status: 'error'; error: string };

export interface GitDiffWorkspace {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: GitDiffSummary | null;
  base: string | null;
  selection: GitDiffSelection | null;
  view: GitDiffView;
  layout: GitDiffLayout;
  /** The commit expanded in the Commits view. */
  openCommit: string | null;
  commitFiles: ReadonlyMap<string, GitCommitFiles>;
  selectBase: (base: string) => void;
  resetBase: () => void;
  select: (selection: GitDiffSelection) => void;
  setView: (view: GitDiffView) => void;
  setLayout: (layout: GitDiffLayout) => void;
  toggleCommit: (commit: string) => void;
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
  const [selection, setSelection] = useState<GitDiffSelection | null>(null);
  const [view, setView] = useState<GitDiffView>('tree');
  const [layout, setLayout] = useState<GitDiffLayout>('unified');
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<ReadonlyMap<string, GitCommitFiles>>(
    () => new Map(),
  );
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const openCommitRef = useRef<string | null>(null);

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
      setSelection(null);
      setView('tree');
      setOpenCommit(null);
      openCommitRef.current = null;
      setCommitFiles(new Map());
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
          const { files } = result.summary;
          setSummary(result.summary);
          setSelection((previous) => {
            if (previous?.commit) return previous;
            if (previous && files.some((file) => file.path === previous.path)) return previous;
            return files[0] ? { commit: null, path: files[0].path } : null;
          });
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
    setSelection(null);
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

  const showCommit = useCallback((commit: string, files: GitDiffFile[]) => {
    if (openCommitRef.current !== commit || !files[0]) return;
    setSelection((previous) =>
      previous?.commit === commit ? previous : { commit, path: files[0].path },
    );
  }, []);

  // Commits never change, so their file lists are read once per project.
  const toggleCommit = useCallback(
    (commit: string) => {
      if (!cwd) return;
      const next = openCommitRef.current === commit ? null : commit;
      openCommitRef.current = next;
      setOpenCommit(next);
      if (!next) return;

      const cached = commitFiles.get(commit);
      if (cached?.status === 'ready') {
        showCommit(commit, cached.files);
        return;
      }
      if (cached?.status === 'loading') return;
      setCommitFiles((previous) => new Map(previous).set(commit, { status: 'loading' }));
      getGitCommitFiles(cwd, commit)
        .then((result) => {
          setCommitFiles((previous) =>
            new Map(previous).set(
              commit,
              result.success
                ? { status: 'ready', files: result.files }
                : { status: 'error', error: result.error },
            ),
          );
          if (result.success) showCommit(commit, result.files);
        })
        .catch(() => {
          setCommitFiles((previous) =>
            new Map(previous).set(commit, {
              status: 'error',
              error: 'Unable to read this commit.',
            }),
          );
        });
    },
    [commitFiles, cwd, showCommit],
  );

  return {
    status,
    error,
    summary,
    base: summary?.base ?? requestedBase,
    selection,
    view,
    layout,
    openCommit,
    commitFiles,
    selectBase,
    resetBase,
    select: setSelection,
    setView,
    setLayout,
    toggleCommit,
    refresh,
  };
}
