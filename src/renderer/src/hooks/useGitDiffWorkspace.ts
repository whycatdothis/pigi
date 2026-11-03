import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitDiffFile, GitDiffSummary } from '../../../shared/ipcContract';
import { onProjectActivity } from '../lib/projectActivity';
import { getGitCommitFiles, getGitDiffSummary } from '../services/piAgentClient';

/** An agent run fires many tool ends; one summary after they settle is enough. */
const AUTO_REFRESH_DELAY_MS = 500;

export type GitDiffView = 'tree' | 'status' | 'commits';
export type GitDiffLayout = 'unified' | 'split';
/** The collapsible groups of the Git status and Commits views. */
export type GitDiffSection =
  | 'changes'
  | 'untracked'
  | 'committed'
  | 'branchCommits'
  | 'baseCommits';

/** Committed work is already reviewed more often than not; what is in flight leads. */
const INITIALLY_COLLAPSED: ReadonlySet<GitDiffSection> = new Set(['committed']);

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
  collapsedSections: ReadonlySet<GitDiffSection>;
  toggleSection: (section: GitDiffSection) => void;
  selectBase: (base: string) => void;
  resetBase: () => void;
  select: (selection: GitDiffSelection) => void;
  setView: (view: GitDiffView) => void;
  setLayout: (layout: GitDiffLayout) => void;
  toggleCommit: (commit: string) => void;
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
  const [collapsedSections, setCollapsedSections] =
    useState<ReadonlySet<GitDiffSection>>(INITIALLY_COLLAPSED);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const openCommitRef = useRef<string | null>(null);
  // Automatic refreshes stay quiet (no spinner, a failure keeps the last
  // summary) and never overlap: a trigger during a load reruns once after it,
  // because on a large repository one summary takes seconds.
  const quietRef = useRef(false);
  const loadingRef = useRef(false);
  const pendingRef = useRef(false);

  const quietRefresh = useCallback(() => {
    if (loadingRef.current) {
      pendingRef.current = true;
      return;
    }
    quietRef.current = true;
    setRevision((value) => value + 1);
  }, []);

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
      const quiet = quietRef.current;
      quietRef.current = false;
      pendingRef.current = false;
      loadingRef.current = true;
      if (!quiet) {
        setStatus('loading');
        setError(null);
      }
      const settle = (): boolean => {
        if (cancelled || id !== requestId.current) return false;
        loadingRef.current = false;
        if (pendingRef.current) queueMicrotask(quietRefresh);
        return true;
      };

      getGitDiffSummary(cwd, requestedBase)
        .then((result) => {
          if (!settle()) return;
          if (!result.success) {
            if (quiet) return;
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
          if (!settle() || quiet) return;
          setSummary(null);
          setStatus('error');
          setError('Unable to read this diff.');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, enabled, requestedBase, revision, quietRefresh]);

  // Agent tool calls change files in any way (bash, scripts), and edits made
  // elsewhere land while the window is in the background, so both refresh.
  useEffect(() => {
    if (!enabled || !cwd) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(quietRefresh, AUTO_REFRESH_DELAY_MS);
    };
    const unsubscribe = onProjectActivity((activityCwd) => {
      if (activityCwd === cwd) schedule();
    });
    window.addEventListener('focus', schedule);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('focus', schedule);
    };
  }, [cwd, enabled, quietRefresh]);

  const beginSelection = useCallback(() => {
    quietRef.current = false;
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

  const toggleSection = useCallback((section: GitDiffSection) => {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (!next.delete(section)) next.add(section);
      return next;
    });
  }, []);

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
    collapsedSections,
    toggleSection,
    selectBase,
    resetBase,
    select: setSelection,
    setView,
    setLayout,
    toggleCommit,
  };
}
