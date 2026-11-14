// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../testing/jsdomSetup';
import type { GitBranchListResult, GitSwitchBranchResult } from '../../../../shared/ipcContract';
import GitBranchPicker from './GitBranchPicker';

const BRANCHES = [
  { name: 'main', current: true, local: true },
  { name: 'feature', current: false, local: true },
];

let listCalls: [string, boolean][] = [];
let listResult: GitBranchListResult = { success: true, branches: BRANCHES };
/** Lets a test hold the branch list open, to answer it out of order. */
let deferredLists: ((result: GitBranchListResult) => void)[] = [];
let deferLists = false;
let switchCalls: [string, string][] = [];
let switchResult: GitSwitchBranchResult = { success: true };

beforeEach(() => {
  listCalls = [];
  listResult = { success: true, branches: BRANCHES };
  deferredLists = [];
  deferLists = false;
  switchCalls = [];
  switchResult = { success: true };
  vi.stubGlobal('piApi', {
    listGitBranches: (cwd: string, includeRemote: boolean) => {
      listCalls.push([cwd, includeRemote]);
      if (deferLists) {
        return new Promise<GitBranchListResult>((resolve) => deferredLists.push(resolve));
      }
      return Promise.resolve(listResult);
    },
    switchGitBranch: (cwd: string, branch: string) => {
      switchCalls.push([cwd, branch]);
      return Promise.resolve(switchResult);
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPicker(onSwitched = vi.fn()): { onSwitched: () => void } {
  render(<GitBranchPicker projectPath="/repo" label="main" onSwitched={onSwitched} />);
  return { onSwitched };
}

async function openList(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Switch branch (main)' }));
  await screen.findByRole('option', { name: /feature/ });
}

describe('GitBranchPicker', () => {
  it('lists the local branches only, and switches to the one picked', async () => {
    const { onSwitched } = renderPicker();
    await openList();

    expect(listCalls).toEqual([['/repo', false]]);
    expect(screen.getByRole('option', { name: /main/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /feature/ }));

    expect(switchCalls).toEqual([['/repo', 'feature']]);
    await waitFor(() => expect(onSwitched).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('closes on its own branch instead of switching to it', async () => {
    const { onSwitched } = renderPicker();
    await openList();

    fireEvent.click(screen.getByRole('option', { name: /main/ }));

    expect(switchCalls).toEqual([]);
    expect(onSwitched).not.toHaveBeenCalled();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('lists the branches of the project it shows now, not the one it left', async () => {
    deferLists = true;
    const onSwitched = vi.fn();
    const { rerender } = render(
      <GitBranchPicker projectPath="/repo" label="main" onSwitched={onSwitched} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch branch (main)' }));
    await waitFor(() => expect(deferredLists).toHaveLength(1));

    rerender(<GitBranchPicker projectPath="/other" label="main" onSwitched={onSwitched} />);
    await waitFor(() => expect(listCalls).toHaveLength(2));
    expect(listCalls[1]).toEqual(['/other', false]);

    // The old project's reply lands last; it must not be listed or switchable.
    await act(async () => {
      deferredLists[1]({
        success: true,
        branches: [{ name: 'other', current: true, local: true }],
      });
      deferredLists[0]({
        success: true,
        branches: [{ name: 'stale', current: false, local: true }],
      });
    });

    expect(await screen.findByRole('option', { name: /other/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /stale/ })).toBeNull();
  });

  it('leaves the shown branch alone when the switch is refused', async () => {
    switchResult = { success: false, error: 'Uncommitted changes would be overwritten.' };
    const { onSwitched } = renderPicker();
    await openList();

    fireEvent.click(screen.getByRole('option', { name: /feature/ }));

    await waitFor(() => expect(switchCalls).toHaveLength(1));
    expect(onSwitched).not.toHaveBeenCalled();
  });
});
