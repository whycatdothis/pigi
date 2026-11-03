// @vitest-environment jsdom
/**
 * When the Git tab refreshes on its own: after agent activity in its project
 * settles, or when the window comes back, quietly and never two at a time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type {
  GitDiffScope,
  GitDiffSummary,
  GitDiffSummaryResult,
} from '../../../shared/ipcContract';
import '../testing/jsdomSetup';
import { notifyProjectActivity } from '../lib/projectActivity';
import { useGitWorkspace } from './useGitWorkspace';

const CWD = '/repo';

function summary(path: string): GitDiffSummary {
  return {
    branch: 'main',
    detached: false,
    base: 'main',
    baseLabel: 'main',
    defaultBase: 'main',
    source: { kind: 'base', base: 'abc' },
    branches: [],
    commits: [],
    moreCommits: false,
    baseCommits: [],
    files: [
      {
        path,
        oldPath: null,
        status: 'modified',
        staged: false,
        unstaged: true,
        additions: 1,
        deletions: 0,
        binary: false,
      },
    ],
  };
}

/** Each call waits until the test answers it. */
let answers: ((result: GitDiffSummaryResult) => void)[] = [];
let requests: [string, GitDiffScope][] = [];

async function answer(result: GitDiffSummaryResult): Promise<void> {
  const next = answers.shift();
  if (!next) throw new Error('no summary request is waiting');
  await act(async () => {
    next(result);
    await Promise.resolve();
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  answers = [];
  requests = [];
  vi.stubGlobal('piApi', {
    getGitDiffSummary: (cwd: string, scope: GitDiffScope) =>
      new Promise<GitDiffSummaryResult>((resolve) => {
        requests.push([cwd, scope]);
        answers.push(resolve);
      }),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openTab(): Promise<{ result: { current: ReturnType<typeof useGitWorkspace> } }> {
  const hook = renderHook(() => useGitWorkspace({ cwd: CWD, enabled: true }));
  await wait(0);
  await answer({ success: true, summary: summary('a.txt') });
  return hook;
}

describe('useGitWorkspace auto refresh', () => {
  it('refreshes once after agent activity in its project settles, without a spinner', async () => {
    const { result } = await openTab();

    notifyProjectActivity('/elsewhere');
    notifyProjectActivity(CWD);
    await wait(300);
    notifyProjectActivity(CWD);
    await wait(300);
    expect(answers).toHaveLength(0);

    await wait(200);
    expect(answers).toHaveLength(1);
    expect(result.current.status).toBe('ready');

    await answer({ success: true, summary: summary('b.txt') });
    expect(result.current.summary?.files[0].path).toBe('b.txt');
  });

  it('runs one more refresh after a load that activity arrived during', async () => {
    await openTab();

    window.dispatchEvent(new Event('focus'));
    await wait(500);
    expect(answers).toHaveLength(1);

    notifyProjectActivity(CWD);
    await wait(500);
    notifyProjectActivity(CWD);
    await wait(500);
    expect(answers).toHaveLength(1);

    await answer({ success: true, summary: summary('a.txt') });
    await wait(0);
    expect(answers).toHaveLength(1);
  });

  it('keeps the last summary when an automatic refresh fails', async () => {
    const { result } = await openTab();

    notifyProjectActivity(CWD);
    await wait(500);
    await answer({ success: false, error: 'index.lock exists' });

    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
    expect(result.current.summary?.files[0].path).toBe('a.txt');
  });
});

describe('useGitWorkspace project and view changes', () => {
  it('asks a newly opened project for its own default base, not the old pick', async () => {
    const hook = renderHook(({ cwd }) => useGitWorkspace({ cwd, enabled: true }), {
      initialProps: { cwd: CWD },
    });
    await wait(0);
    await answer({ success: true, summary: summary('a.txt') });
    act(() => hook.result.current.setView('diff'));
    await wait(0);
    await answer({ success: true, summary: summary('a.txt') });
    act(() => hook.result.current.selectBase('feature'));
    await wait(0);
    await answer({ success: true, summary: summary('a.txt') });

    requests = [];
    hook.rerender({ cwd: '/other' });
    await wait(0);
    expect(requests).toEqual([['/other', { kind: 'uncommitted' }]]);
    await answer({ success: true, summary: summary('a.txt') });
    act(() => hook.result.current.setView('diff'));
    await wait(0);
    expect(requests[1]).toEqual(['/other', { kind: 'branch', base: null }]);
  });

  it("leaves a commit's file when switching away from the Commits view", async () => {
    const { result } = await openTab();
    act(() => result.current.select({ commit: 'c1', path: 'x.txt' }));
    act(() => result.current.setView('diff'));
    expect(result.current.selection).toEqual({ commit: null, path: 'a.txt' });
  });
});
