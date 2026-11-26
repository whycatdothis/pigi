// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../testing/jsdomSetup';
import type { PiSessionInfo, TaskInfo } from '../../../../shared/ipcContract';
import SessionSwitcher from './SessionSwitcher';

const task: TaskInfo = {
  name: 'roadmap 二期',
  path: '/tasks/roadmap',
  workDirs: [],
  suggestedDirs: [],
  activeWorkDir: null,
  hidden: false,
  emoji: '🚀',
};

const taskSession: PiSessionInfo = {
  path: '/sessions/s1.jsonl',
  id: 's1',
  cwd: '/tasks/roadmap',
  created: '2026-01-01T00:00:00Z',
  modified: '2026-01-02T00:00:00Z',
  messageCount: 1,
  firstMessage: 'hello',
};

function renderSwitcher(overrides: Partial<Parameters<typeof SessionSwitcher>[0]> = {}): {
  onSwitch: ReturnType<typeof vi.fn>;
  onSelectTask: ReturnType<typeof vi.fn>;
} {
  const onSwitch = vi.fn();
  const onSelectTask = vi.fn();
  render(
    <SessionSwitcher
      projectSessions={{}}
      navigationBackStack={[]}
      navigationForwardStack={[]}
      activeSessionPath={null}
      onSwitch={onSwitch}
      tasks={[task]}
      onSelectTask={onSelectTask}
      open
      onOpenChange={vi.fn()}
      {...overrides}
    />,
  );
  return { onSwitch, onSelectTask };
}

afterEach(cleanup);

describe('SessionSwitcher task search', () => {
  it('preselects the matching task so Enter opens it, even with no session matches', async () => {
    const { onSwitch, onSelectTask } = renderSwitcher();
    const input = screen.getByPlaceholderText('Type freely to fuzzy search sessions');
    fireEvent.change(input, { target: { value: 'roadmap' } });

    // Preselection lands through a deferred query and an animation frame.
    const option = await screen.findByRole('option', { name: /roadmap 二期/ });
    await waitFor(() => expect(option).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelectTask).toHaveBeenCalledWith('/tasks/roadmap');
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('subtitles a task session with the display name, not the directory name', async () => {
    renderSwitcher({ projectSessions: { '/tasks/roadmap': [taskSession] } });

    const subtitle = await screen.findByText('roadmap 二期');
    expect(subtitle).toBeInTheDocument();
  });
});
