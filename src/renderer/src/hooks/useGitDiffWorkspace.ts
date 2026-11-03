import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitDiffFile, GitDiffScope, GitDiffSummary } from '../../../shared/ipcContract';
import { onProjectActivity } from '../lib/projectActivity';
import { getGitCommitFiles, getGitDiffSummary } from '../services/piAgentClient';

/** An agent run fires many tool ends; one summary after they settle is enough. */
const AUTO_REFRESH_DELAY_MS = 500;

export type GitDiffMode = GitDiffScope['kind'];
export type GitDiffView = 'tree' | 'status' | 'commits';
export type GitDiffLayout = 'unified' | 'split';
/** The collapsible groups of the Git status and Commits views. */
export type GitDiffSection = 'staged' | 'unstaged' | 'branchCommits' | 'baseCommits';

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
  /** The mode in effect: the chosen one in the tree view; Git status and Commits always compare against a base. */
  mode: GitDiffMode;
  base: string | null;
  selection: GitDiffSelection | null;
  view: GitDiffView;
  layout: GitDiffLayout;
  /** The commit expanded in the Commits view. */
  openCommit: string | null;
  commitFiles: ReadonlyMap<string, GitCommitFiles>;
  collapsedSections: ReadonlySet<GitDiffSection>;
  toggleSection: (section: GitDiffSection) => void;
  selectMode: (mode: GitDiffMode) => void;
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
  const [mode, setMode] = useState<GitDiffMode>('branch');
  const [requestedBase, setRequestedBase] = useState<string | null>(null);
  const [selection, setSelection] = useState<GitDiffSelection | null>(null);
  const [view, setView] = useState<GitDiffView>('tree');
  // Git status is the working tree against HEAD; Commits lists the branch.
  const scopeMode: GitDiffMode =
    view === 'tree' ? mode : view === 'status' ? 'uncommitted' : 'branch';
  // The Commits view lists the branch's own commits, so it ignores a picked base.
  const scopeBase = view === 'commits' ? null : requestedBase;
  const [layout, setLayout] = useState<GitDiffLayout>('unified');
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<ReadonlyMap<string, GitCommitFiles>>(
    () => new Map(),
  );
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<GitDiffSection>>(
    () => new Set(),
  );
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

  // Reset while rendering, not in an effect: the load below must already see
  // the new project's state, or it first asks the new repository for the old
  // base (seconds of git that cannot be cancelled).
  const [stateCwd, setStateCwd] = useState(cwd);
  if (stateCwd !== cwd) {
    setStateCwd(cwd);
    setSummary(null);
    setError(null);
    setStatus('idle');
    setRequestedBase(null);
    setSelection(null);
    setView('tree');
    setOpenCommit(null);
    setCommitFiles(new Map());
  }
  useEffect(() => {
    openCommitRef.current = null;
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

      const scope: GitDiffScope =
        scopeMode === 'branch' ? { kind: 'branch', base: scopeBase } : { kind: scopeMode };
      getGitDiffSummary(cwd, scope)
        .then((result) => {
          if (!settle()) return;
          if (!result.success) {
            if (quiet) return;
            setSummary(null);
            setStatus('error');
            setError(result.error);
            return;
          }
          const { files, commits, baseCommits } = result.summary;
          setSummary(result.summary);
          setSelection((previous) => {
            const commit = previous?.commit;
            // A commit a rebase dropped no longer has a row to come back to.
            if (commit && [...commits, ...baseCommits].some((entry) => entry.hash === commit)) {
              return previous;
            }
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
  }, [cwd, enabled, scopeMode, scopeBase, revision, quietRefresh]);

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

  // A commit's file belongs to the Commits view; elsewhere it would show with no row selected.
  const changeView = useCallback(
    (next: GitDiffView) => {
      setView(next);
      if (next === 'commits') return;
      setSelection((previous) => {
        if (!previous?.commit) return previous;
        const first = summary?.files[0];
        return first ? { commit: null, path: first.path } : null;
      });
    },
    [summary],
  );

  const beginSelection = useCallback(() => {
    quietRef.current = false;
    setSelection(null);
    setStatus('loading');
    setError(null);
  }, []);

  const selectMode = useCallback(
    (next: GitDiffMode) => {
      setMode(next);
      // "All changes since <default branch>" means that branch, even after another was picked.
      setRequestedBase(null);
      setRevision((value) => value + 1);
      beginSelection();
    },
    [beginSelection],
  );

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

  // App passes this to memoized components; a fresh object every render
  // would re-render the whole tab on each streamed agent batch.
  const base = summary?.base ?? requestedBase;
  return useMemo(
    () => ({
      status,
      error,
      summary,
      mode: scopeMode,
      base,
      selection,
      view,
      layout,
      openCommit,
      commitFiles,
      collapsedSections,
      toggleSection,
      selectMode,
      selectBase,
      resetBase,
      select: setSelection,
      setView: changeView,
      setLayout,
      toggleCommit,
    }),
    [
      status,
      error,
      summary,
      scopeMode,
      base,
      selection,
      view,
      layout,
      openCommit,
      commitFiles,
      collapsedSections,
      toggleSection,
      selectMode,
      selectBase,
      resetBase,
      changeView,
      toggleCommit,
    ],
  );
}
