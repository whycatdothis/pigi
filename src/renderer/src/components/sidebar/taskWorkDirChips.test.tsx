// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';

vi.mock('../../services/piAgentClient', () => ({
  pickDirectory: vi.fn(),
  getHomeDir: vi.fn(() => '/home/test'),
}));

import type { TaskInfo, TaskResult } from '../../../../shared/ipcContract';
import { getHomeDir, pickDirectory } from '../../services/piAgentClient';
import { useAppStore } from '../../state/appStore';
import { TaskWorkDirChips } from './taskWorkDirChips';

const pickDirectoryMock = vi.mocked(pickDirectory);
const getHomeDirMock = vi.mocked(getHomeDir);

const task: TaskInfo = {
  name: 'demo',
  path: '/tasks/demo',
  workDirs: ['/repo/alpha'],
  suggestedDirs: [],
  activeWorkDir: null,
  dirLog: [],
  hidden: false,
  emoji: null,
};

const otherTask: TaskInfo = {
  name: 'other',
  path: '/tasks/other',
  workDirs: ['/repo/from-other-task'],
  suggestedDirs: [],
  activeWorkDir: null,
  dirLog: [],
  hidden: false,
  emoji: null,
};

const okResult = (overrides: Partial<TaskInfo> = {}): TaskResult => ({
  success: true,
  task: { ...task, ...overrides },
});

function renderChips(onUpdateTask = vi.fn(() => Promise.resolve(okResult()))): {
  onUpdateTask: ReturnType<typeof vi.fn>;
} {
  render(<TaskWorkDirChips task={task} onUpdateTask={onUpdateTask} onSelectWorkDir={vi.fn()} />);
  return { onUpdateTask };
}

async function openEditor(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTitle('Edit working directories'));
  return screen.findByLabelText('Add working directory');
}

beforeEach(() => {
  getHomeDirMock.mockReturnValue('/home/test');
  useAppStore.setState({
    recentProjects: [
      { path: '/repo/alpha', name: 'alpha' },
      { path: '/repo/beta', name: 'beta' },
    ],
    tasks: [task, otherTask],
  });
});

afterEach(cleanup);

describe('TaskWorkDirChips editor', () => {
  it('shows the dropdown only after typing, with the native picker pinned first', async () => {
    renderChips();
    const input = await openEditor();

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, { target: { value: 'repo' } });
    const options = screen.getAllByRole('option');
    // /repo/alpha is already a chip; the open row is pinned above the matches.
    expect(options[0]).toHaveTextContent('Open directory…');
    const dirs = options.slice(1).map((option) => option.textContent);
    expect(dirs.sort()).toEqual(['/repo/beta', '/repo/from-other-task']);
    // Middle truncation splits parent and folder name; hover keeps the full path.
    expect(options[1]).toHaveAttribute('title', options[1].textContent);
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('fuzzy-filters as you type and Enter takes the first match', async () => {
    const { onUpdateTask } = renderChips();
    const input = await openEditor();

    fireEvent.change(input, { target: { value: 'othertask' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdateTask).toHaveBeenCalledWith('/tasks/demo', {
      addWorkDirs: ['/repo/from-other-task'],
    });
  });

  it('adds the typed text when nothing matches', async () => {
    const { onUpdateTask } = renderChips();
    const input = await openEditor();

    fireEvent.change(input, { target: { value: '/somewhere/brand-new' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdateTask).toHaveBeenCalledWith('/tasks/demo', {
      addWorkDirs: ['/somewhere/brand-new'],
    });
  });

  it('arrow-navigates past the last dir onto the picker row and opens it', async () => {
    pickDirectoryMock.mockResolvedValue({ success: true, path: '/picked/dir' });
    const { onUpdateTask } = renderChips();
    const input = await openEditor();

    fireEvent.change(input, { target: { value: 'repo' } });
    // The first match reads as selected already, so two downs move past the
    // second dir onto the picker row.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(pickDirectoryMock).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(onUpdateTask).toHaveBeenCalledWith('/tasks/demo', {
        addWorkDirs: ['/picked/dir'],
      }),
    );
  });

  it('cancelling the native picker adds nothing', async () => {
    pickDirectoryMock.mockResolvedValue({ success: true, path: null });
    const { onUpdateTask } = renderChips();
    const input = await openEditor();

    fireEvent.change(input, { target: { value: 'repo' } });
    fireEvent.click(screen.getByRole('option', { name: /Open directory/ }));
    await vi.waitFor(() => expect(pickDirectoryMock).toHaveBeenCalled());
    expect(onUpdateTask).not.toHaveBeenCalled();
  });

  it('tilde-shortens home paths in matches', async () => {
    getHomeDirMock.mockReturnValue('/repo');
    renderChips();
    const input = await openEditor();

    fireEvent.change(input, { target: { value: 'beta' } });
    const option = screen.getByRole('option', { name: /beta/ });
    expect(option).toHaveAttribute('title', '~/beta');
    expect(option).toHaveTextContent('~/beta');
  });

  it('Escape closes the dropdown but keeps the editor open', async () => {
    renderChips();
    const input = await openEditor();

    fireEvent.change(input, { target: { value: 'beta' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    // The popover survived; typing still works and reopens the dropdown.
    fireEvent.change(input, { target: { value: 'bet' } });
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });
});
