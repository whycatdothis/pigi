import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { GitDiffFile, GitDiffScope, GitDiffSummary } from '../../../shared/ipcContract';
import { onProjectActivity } from '../lib/projectActivity';
import { getGitCommitFiles, getGitDiffSummary, setGitStaged } from '../services/piAgentClient';

/**
 * Agent activity refreshes at most this often, or every `SUMMARY_COST_FACTOR`
 * times the last summary's duration if longer: a run fires a tool end every
 * few hundred ms, and on a big repository a summary takes seconds, so a fixed
 * interval would keep git busy most of the run; 4x caps it near a quarter.
 */
const AUTO_REFRESH_INTERVAL_MS = 5000;
const SUMMARY_COST_FACTOR = 4;

/** The Diff view's modes; Git status has a scope of its own. */
export type GitDiffMode = Exclude<GitDiffScope['kind'], 'status'>;
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

/**
 * The selection as the current list shows it: the picked file while it is
 * listed, else the first one. Derived when rendering, because a cached
 * summary shows before any load could correct a stored pick.
 */
function shownSelection(
  selection: GitSelection | null,
  summary: GitDiffSummary,
  view: GitView,
): GitSelection | null {
  if (selection && fitsView(selection, view)) {
    if (isListed(selection, summary)) return selection;
    // Staging moves the file to the other group; follow it there.
    if (selection.list === 'staged' || selection.list === 'unstaged') {
      const other = selection.list === 'staged' ? 'unstaged' : 'staged';
      if (summary[other].some((file) => file.path === selection.path)) {
        return { list: other, path: selection.path };
      }
    }
  }
  return firstFile(summary, view === 'status');
}

function firstFile(summary: GitDiffSummary, statusLists: boolean): GitSelection | null {
  if (statusLists) {
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
  // The last summary of each scope, so switching views shows it at once and
  // refreshes it quietly instead of waiting seconds on a big repository. The
  // ref lets the load read it without depending on it; both change together.
  const [summaries, setSummaries] = useState<ReadonlyMap<string, GitDiffSummary>>(() => new Map());
  const summariesRef = useRef(summaries);
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
  const scopeKind: GitDiffScope['kind'] = view === 'status' ? 'status' : scopeMode;
  // Only the Diff view's branch mode compares against a picked base.
  const scopeBase = view === 'diff' && scopeKind === 'branch' ? requestedBase : null;
  // A summary belongs to the scope that asked for it: another scope's would
  // show, say, "No commits since HEAD" in the Commits view.
  const scopeKey = `${scopeKind} ${scopeBase ?? ''}`;
  const summary = summaries.get(scopeKey) ?? null;
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
  const summaryMs = useRef(0);
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
    setSummaries(new Map());
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
    summariesRef.current = new Map();
  }, [cwd]);

  const storeSummary = useCallback((key: string, next: GitDiffSummary | null) => {
    const map = new Map(summariesRef.current);
    if (next) map.set(key, next);
    else map.delete(key);
    summariesRef.current = map;
    setSummaries(map);
  }, []);

  useEffect(() => {
    if (!enabled || !cwd) return;
    let cancelled = false;
    const id = ++requestId.current;
    // Deferred so the effect body does not set state synchronously, which the
    // react-hooks/set-state-in-effect rule rejects.
    queueMicrotask(() => {
      if (cancelled) return;
      // A cached summary stays on screen, and an error from another scope goes.
      const cached = summariesRef.current.has(scopeKey);
      const quiet = quietRef.current || cached;
      quietRef.current = false;
      pendingRef.current = false;
      loadingRef.current = true;
      if (cached || !quiet) {
        setStatus(cached ? 'ready' : 'loading');
        setError(null);
      }
      const settle = (): boolean => {
        if (cancelled || id !== requestId.current) return false;
        loadingRef.current = false;
        if (pendingRef.current) queueMicrotask(quietRefresh);
        return true;
      };

      const scope: GitDiffScope =
        scopeKind === 'branch' ? { kind: 'branch', base: scopeBase } : { kind: scopeKind };
      const startedAt = Date.now();
      getGitDiffSummary(cwd, scope)
        .then((result) => {
          if (!settle()) return;
          summaryMs.current = Date.now() - startedAt;
          if (!result.success) {
            if (quiet) return;
            storeSummary(scopeKey, null);
            setStatus('error');
            setError(result.error);
            return;
          }
          storeSummary(scopeKey, result.summary);
          // Kept, so a file shown without a click still follows a stage.
          setSelection((previous) => previous ?? firstFile(result.summary, scopeKind === 'status'));
          setStatus('ready');
        })
        .catch(() => {
          if (!settle() || quiet) return;
          storeSummary(scopeKey, null);
          setStatus('error');
          setError('Unable to read this diff.');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, enabled, scopeKind, scopeBase, scopeKey, revision, quietRefresh, storeSummary]);

  // Agent tool calls change files in any way (bash, scripts): the first
  // refreshes at once, the rest at most once per interval, the last never
  // lost. Coming back to the window is rare, so it refreshes at once.
  useEffect(() => {
    if (!enabled || !cwd) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRefresh = -Infinity;
    const schedule = (): void => {
      if (timer) return;
      const interval = Math.max(AUTO_REFRESH_INTERVAL_MS, SUMMARY_COST_FACTOR * summaryMs.current);
      const wait = Math.max(0, lastRefresh + interval - Date.now());
      timer = setTimeout(() => {
        timer = null;
        lastRefresh = Date.now();
        quietRefresh();
      }, wait);
    };
    const unsubscribe = onProjectActivity((activityCwd) => {
      if (activityCwd === cwd) schedule();
    });
    window.addEventListener('focus', quietRefresh);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('focus', quietRefresh);
    };
  }, [cwd, enabled, quietRefresh]);

  const shown = useMemo(
    () => (summary ? shownSelection(selection, summary, view) : null),
    [selection, summary, view],
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

  // A pending quiet refresh must not make a picked comparison's load quiet:
  // with nothing cached it shows a spinner and its errors. A cached one
  // stays on screen and refreshes quietly, as a view switch does.
  const reload = useCallback(() => {
    quietRef.current = false;
    setRevision((value) => value + 1);
  }, []);

  const selectMode = useCallback(
    (next: GitDiffMode) => {
      setMode(next);
      // "All changes since <default branch>" means that branch, even after another was picked.
      setRequestedBase(null);
      reload();
    },
    [reload],
  );

  const selectBase = useCallback(
    (base: string) => {
      setRequestedBase(base);
      reload();
    },
    [reload],
  );

  const resetBase = useCallback(() => {
    setRequestedBase(null);
    reload();
  }, [reload]);

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
      selection: shown,
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
      setView,
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
      shown,
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
      toggleCommit,
    ],
  );
}
