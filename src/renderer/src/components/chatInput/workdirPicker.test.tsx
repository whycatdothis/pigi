// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';

vi.mock('../../services/piAgentClient', () => ({
  getHomeDir: vi.fn(() => '/home/test'),
  pickDirectory: vi.fn(),
}));

import type { ProjectDirectory, TaskDirEvent, TaskInfo } from '../../../../shared/ipcContract';
import {
  buildWorkdirPickerSections,
  type WorkdirPickerSections,
} from '../../lib/workdirPickerSections';
import { pickDirectory } from '../../services/piAgentClient';
import { WorkdirPicker } from './workdirPicker';

const pickDirectoryMock = vi.mocked(pickDirectory);

const project = (path: string): ProjectDirectory => ({ path, name: path.split('/').pop() ?? path });

const task = (path: string, workDirs: string[], dirLog: TaskDirEvent[] = []): TaskInfo => ({
  name: path.split('/').pop() ?? path,
  path,
  workDirs,
  suggestedDirs: [],
  activeWorkDir: null,
  dirLog,
  hidden: false,
  emoji: null,
});

const dirEvent = (dir: string, action: TaskDirEvent['action']): TaskDirEvent => ({
  dir,
  action,
  source: 'manual',
  at: 1,
});

const SECTIONS: WorkdirPickerSections = {
  taskDirs: ['/work/alpha', '/work/beta'],
  historyDirs: ['/work/old-thing'],
  projects: [project('/repo/pigi'), project('/repo/main')],
};

function renderPicker(onPick = vi.fn(), onClose = vi.fn()): { onPick: ReturnType<typeof vi.fn> } {
  render(
    <div>
      <WorkdirPicker
        anchor={document.createElement('button')}
        sections={SECTIONS}
        onPick={onPick}
        onClose={onClose}
      />
    </div>,
  );
  return { onPick };
}

const optionNames = (): string[] =>
  screen.getAllByRole('option').map((option) => option.textContent ?? '');

afterEach(() => {
  cleanup();
});

describe('WorkdirPicker', () => {
  it('lists the task directories first, then history and projects merged', async () => {
    renderPicker();
    await screen.findByPlaceholderText('Filter directories');

    expect(optionNames()).toEqual(['alpha', 'beta', 'old-thing', 'pigi', 'main']);
    // The task's own rows read in accent, like the workdir rows elsewhere.
    expect(screen.getByText('alpha')).toHaveClass('text-[var(--system-accent)]');
    expect(screen.getByText('old-thing')).not.toHaveClass('text-[var(--system-accent)]');
  });

  it('lists a directory once, in the most specific section', async () => {
    render(
      <div>
        <WorkdirPicker
          anchor={document.createElement('button')}
          sections={{
            taskDirs: ['/work/alpha'],
            historyDirs: ['/work/alpha', '/repo/pigi'],
            projects: [project('/repo/pigi')],
          }}
          onPick={vi.fn()}
          onClose={vi.fn()}
        />
      </div>,
    );
    await screen.findByPlaceholderText('Filter directories');

    expect(optionNames()).toEqual(['alpha', 'pigi']);
  });

  it('filters across every section into one flat list', async () => {
    renderPicker();
    const input = await screen.findByPlaceholderText('Filter directories');

    fireEvent.change(input, { target: { value: 'old' } });

    expect(optionNames()).toEqual(['old-thing']);
  });

  it('picks a row by click and by Enter on the first match', async () => {
    const { onPick } = renderPicker();
    const input = await screen.findByPlaceholderText('Filter directories');

    fireEvent.change(input, { target: { value: 'beta' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('/work/beta');

    // The app closes the popover on a pick; the mock does not, so reset the filter.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(await screen.findByRole('option', { name: 'alpha' }));
    expect(onPick).toHaveBeenCalledWith('/work/alpha');
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    renderPicker(vi.fn(), onClose);
    const input = await screen.findByPlaceholderText('Filter directories');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('picks a directory from the system dialog via the Open button', async () => {
    const { onPick } = renderPicker();
    const openButton = await screen.findByRole('button', { name: 'Open' });

    pickDirectoryMock.mockResolvedValue({ success: true, path: '/picked/dir' });
    fireEvent.click(openButton);
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('/picked/dir'));

    // Cancelling the dialog changes nothing.
    onPick.mockClear();
    pickDirectoryMock.mockResolvedValue({ success: true, path: null });
    fireEvent.click(openButton);
    await vi.waitFor(() => expect(pickDirectoryMock).toHaveBeenCalledTimes(2));
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('buildWorkdirPickerSections', () => {
  it('returns null when the cwd is not a task', () => {
    expect(buildWorkdirPickerSections([task('/tasks/a', [])], '/elsewhere', [])).toBeNull();
  });

  it('splits dirs into task, history and project sections, each claimed once', () => {
    const sections = buildWorkdirPickerSections(
      [task('/tasks/a', ['/work/alpha']), task('/tasks/b', ['/work/alpha', '/work/beta'])],
      '/tasks/a',
      [project('/work/beta'), project('/repo/pigi')],
    );

    expect(sections).toEqual({
      taskDirs: ['/work/alpha'],
      historyDirs: ['/work/beta'],
      projects: [project('/repo/pigi')],
    });
  });

  it('hides directories the user removed or dismissed from this task', () => {
    const sections = buildWorkdirPickerSections(
      [
        task(
          '/tasks/a',
          ['/work/alpha'],
          [
            dirEvent('/work/removed', 'removed'),
            dirEvent('/work/dismissed', 'dismissed'),
            dirEvent('/work/back', 'removed'),
            dirEvent('/work/back', 'added'),
          ],
        ),
        task('/tasks/b', ['/work/removed', '/work/dismissed', '/work/back']),
      ],
      '/tasks/a',
      [project('/work/removed'), project('/work/dismissed'), project('/work/back')],
    );

    expect(sections?.historyDirs).toEqual(['/work/back']);
    expect(sections?.projects).toEqual([]);
  });

  it('only rejects for the task that removed the directory', () => {
    const sections = buildWorkdirPickerSections(
      [task('/tasks/a', [], [dirEvent('/work/beta', 'removed')]), task('/tasks/b', [])],
      '/tasks/b',
      [project('/work/beta')],
    );

    expect(sections?.projects).toEqual([project('/work/beta')]);
  });
});
