import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { GitDiffFile, GitDiffScope, GitDiffSummary } from '../../../shared/ipcContract';
import { onProjectActivity } from '../lib/projectActivity';
import { getGitCommitFiles, getGitDiffSummary, setGitStaged } from '../services/piAgentClient';

/**
 * Agent activity refreshes at most this often: a run fires a tool end every
 * few hundred ms, and on a large repository one summary is ~17 git processes.
 */
const AUTO_REFRESH_INTERVAL_MS = 5000;

export type GitDiffMode = GitDiffScope['kind'];
export type GitView = 'status' | 'diff' | 'commits';
/** How the Git status and Diff views list files. */
export type GitFileList = 'tree' | 'flat';
export type GitDiffLayout = 'unified' | 'split';
/** The collapsible groups of the Git status and Commits views. */
export type GitSection = 'staged' | 'unstaged' | 'branchCommits' | 'baseCommits';

/** A file and the list it was picked from: the comparison, a Git status group or one commit. */
export type GitSelection =
  | { list: 'files' | 'staged' | 'unstaged'; path: string }
  | { list: 'commit'; commit: string; path: string };

function isListed(selection: GitSelection, summary: GitDiffSummary): boolean {
  if (selection.list === 'commit') {
    // A commit a rebase dropped no longer has a row to come back to.
    return [...summary.commits, ...summary.baseCommits].some(
      (entry) => entry.hash === selection.commit,
    );
  }
  return summary[selection.list].some((file) => file.path === selection.path);
}

function fitsView(selection: GitSelection, view: GitView): boolean {
  if (view === 'status') return selection.list === 'staged' || selection.list === 'unstaged';
  return selection.list === 'files' || (view === 'commits' && selection.list === 'commit');
}

function firstFile(summary: GitDiffSummary, view: GitView): GitSelection | null {
  if (view === 'status') {
    const list = summary.staged[0] ? 'staged' : 'unstaged';
    const file = summary[list][0];
    return file ? { list, path: file.path } : null;
  }
  return summary.files[0] ? { list: 'files', path: summary.files[0].path } : null;
}

export type GitCommitFiles =
  | { status: 'loading' }
  | { status: 'ready'; files: GitDiffFile[] }
  | { status: 'error'; error: string };

export interface GitWorkspace {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: GitDiffSummary | null;
  /** The mode in effect: the chosen one in the Diff view; Git status and Commits have a fixed one. */
  mode: GitDiffMode;
  base: string | null;
  selection: GitSelection | null;
  view: GitView;
  fileList: GitFileList;
  layout: GitDiffLayout;
  /** The commit expanded in the Commits view. */
  openCommit: string | null;
  commitFiles: ReadonlyMap<string, GitCommitFiles>;
  collapsedSections: ReadonlySet<GitSection>;
  /** A stage or unstage of everything is running. */
  staging: boolean;
  setStaged: (staged: boolean) => void;
  toggleSection: (section: GitSection) => void;
  selectMode: (mode: GitDiffMode) => void;
  selectBase: (base: string) => void;
  resetBase: () => void;
  select: (selection: GitSelection) => void;
  setView: (view: GitView) => void;
  setFileList: (fileList: GitFileList) => void;
  setLayout: (layout: GitDiffLayout) => void;
  toggleCommit: (commit: string) => void;
}

/**
 * The Git tab's comparison state. The selected base is deliberately not
 * persisted: switching projects should start from that project's upstream,
 * not from a ref that may not exist there.
 */
export function useGitWorkspace({
  cwd,
  enabled,
}: {
  cwd: string | null;
  enabled: boolean;
}): GitWorkspace {
  const [loaded, setLoaded] = useState<{ scope: string; summary: GitDiffSummary } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GitDiffMode>('branch');
  const [requestedBase, setRequestedBase] = useState<string | null>(null);
  const [selection, setSelection] = useState<GitSelection | null>(null);
  const [view, setView] = useState<GitView>('status');
  const [fileList, setFileList] = useState<GitFileList>('tree');
  // Git status is the working tree against HEAD; Commits lists the branch.
  const scopeMode: GitDiffMode =
    view === 'diff' ? mode : view === 'status' ? 'uncommitted' : 'branch';
  // The Commits view lists the branch's own commits, so it ignores a picked base.
  const scopeBase = view === 'commits' ? null : requestedBase;
  // A summary belongs to the scope that asked for it: right after a view
  // switch the last one would show, say, "No commits since HEAD" from the
  // working-tree summary until the branch loads.
  const scopeKey = `${scopeMode} ${scopeBase ?? ''}`;
  const summary = loaded?.scope === scopeKey ? loaded.summary : null;
  const [layout, setLayout] = useState<GitDiffLayout>('unified');
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<ReadonlyMap<string, GitCommitFiles>>(
    () => new Map(),
  );
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<GitSection>>(
    () => new Set(),
  );
  const [revision, setRevision] = useState(0);
  const [staging, setStaging] = useState(false);
  const requestId = useRef(0);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
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
    setLoaded(null);
    setError(null);
    setStatus('idle');
    setRequestedBase(null);
    setSelection(null);
    setView('status');
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
            setLoaded(null);
            setStatus('error');
            setError(result.error);
            return;
          }
          setLoaded({ scope: scopeKey, summary: result.summary });
          setSelection((previous) =>
            previous && isListed(previous, result.summary)
              ? previous
              : firstFile(result.summary, viewRef.current),
          );
          setStatus('ready');
        })
        .catch(() => {
          if (!settle() || quiet) return;
          setLoaded(null);
          setStatus('error');
          setError('Unable to read this diff.');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, enabled, scopeMode, scopeBase, scopeKey, revision, quietRefresh]);

  // Agent tool calls change files in any way (bash, scripts), and edits made
  // elsewhere land while the window is in the background, so both refresh:
  // the first at once, the rest at most once per interval, the last never lost.
  useEffect(() => {
    if (!enabled || !cwd) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRefresh = -Infinity;
    const schedule = (): void => {
      if (timer) return;
      const wait = Math.max(0, lastRefresh + AUTO_REFRESH_INTERVAL_MS - Date.now());
      timer = setTimeout(() => {
        timer = null;
        lastRefresh = Date.now();
        quietRefresh();
      }, wait);
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

  // A file from another view's list would show with no row selected.
  const changeView = useCallback(
    (next: GitView) => {
      setView(next);
      setSelection((previous) => {
        if (previous && fitsView(previous, next)) return previous;
        return summary ? firstFile(summary, next) : null;
      });
    },
    [summary],
  );

  const setStaged = useCallback(
    (staged: boolean) => {
      if (!cwd) return;
      setStaging(true);
      setGitStaged(cwd, staged)
        .then((result) => {
          if (!result.success) toast.error(result.error);
        })
        .catch(() => {
          toast.error(staged ? 'Unable to stage the changes.' : 'Unable to unstage the changes.');
        })
        .finally(() => {
          setStaging(false);
          quietRefresh();
        });
    },
    [cwd, quietRefresh],
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

  const toggleSection = useCallback((section: GitSection) => {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (!next.delete(section)) next.add(section);
      return next;
    });
  }, []);

  const showCommit = useCallback((commit: string, files: GitDiffFile[]) => {
    if (openCommitRef.current !== commit || !files[0]) return;
    setSelection((previous) =>
      previous?.list === 'commit' && previous.commit === commit
        ? previous
        : { list: 'commit', commit, path: files[0].path },
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
      fileList,
      layout,
      openCommit,
      commitFiles,
      collapsedSections,
      staging,
      setStaged,
      toggleSection,
      selectMode,
      selectBase,
      resetBase,
      select: setSelection,
      setView: changeView,
      setFileList,
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
      fileList,
      layout,
      openCommit,
      commitFiles,
      collapsedSections,
      staging,
      setStaged,
      toggleSection,
      selectMode,
      selectBase,
      resetBase,
      changeView,
      toggleCommit,
    ],
  );
}
