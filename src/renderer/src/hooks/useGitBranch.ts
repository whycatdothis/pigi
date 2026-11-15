/**
 * The branch label next to the composer, and keeping it honest.
 *
 * A run can move the checkout under the label (the agent's own `git switch`, or
 * a person in a terminal beside it), so it is refetched when the work
 * directory, the session or the idle state changes, and polled while any
 * session is running.
 */
import { useCallback, useEffect, useState } from 'react';
import { getGitBranch } from '../services/piAgentClient';

/** A running session can check out another branch; follow it while one does. */
const GIT_BRANCH_POLL_INTERVAL_MS = 10_000;

export function useGitBranch({
  cwd,
  sessionPath,
  isIdle,
  anySessionBusy,
}: {
  cwd: string;
  sessionPath: string | null;
  isIdle: boolean;
  anySessionBusy: boolean;
}): { gitBranch: string | null; refreshGitBranch: () => Promise<void> } {
  const [gitBranch, setGitBranch] = useState<string | null>(null);

  const refreshGitBranch = useCallback(async () => {
    const result = await getGitBranch(cwd);
    setGitBranch(result.success ? result.branch : null);
  }, [cwd]);

  // Refetch whenever the cwd, the active session, or the idle state changes:
  // new/switched sessions may point at a different checkout, and a finished
  // run may have changed the branch.
  useEffect(() => {
    let cancelled = false;
    getGitBranch(cwd).then((result) => {
      if (!cancelled) {
        setGitBranch(result.success ? result.branch : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, sessionPath, isIdle]);

  // The idle transition above catches the result of a run that moved the
  // checkout; this follows it while the run is still going.
  useEffect(() => {
    if (!anySessionBusy) return;
    const timer = window.setInterval(() => void refreshGitBranch(), GIT_BRANCH_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [anySessionBusy, refreshGitBranch]);

  return { gitBranch, refreshGitBranch };
}
