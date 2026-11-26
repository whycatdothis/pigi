// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/piAgentClient', () => ({
  reportTaskDirs: vi.fn(),
}));
vi.mock('../hooks/useTranscript', () => ({
  peekTranscriptController: vi.fn(),
}));

import { peekTranscriptController } from '../hooks/useTranscript';
import { reportTaskDirs } from '../services/piAgentClient';
import { useAppStore } from '../state/appStore';
import type { TaskInfo } from '../../../shared/ipcContract';
import type { TranscriptController, TranscriptNode } from '../state/transcriptController';
import { startTaskDirSuggestions } from './taskDirSuggestions';

const reportMock = vi.mocked(reportTaskDirs);
const peekMock = vi.mocked(peekTranscriptController);

const task: TaskInfo = {
  name: 'demo',
  path: '/tasks/demo',
  workDirs: [],
  suggestedDirs: [],
  activeWorkDir: null,
};
const sessionPath = '/sessions/one.jsonl';

let nodeId = 0;
const userNode = (text: string, sentAt: number, filePaths?: string[]): TranscriptNode => ({
  id: `u${nodeId++}`,
  role: 'user',
  text,
  sentAt,
  filePaths,
});
const toolNode = (
  args: unknown,
  startedAt: number | undefined,
  status: 'running' | 'success' | 'cancelled' = 'success',
): Extract<TranscriptNode, { role: 'tool' }> => ({
  id: `t${nodeId++}`,
  role: 'tool',
  toolCallId: `c${nodeId}`,
  name: 'bash',
  args,
  status,
  output: '',
  isError: false,
  startedAt,
});

function controllerWith(nodes: TranscriptNode[]): TranscriptController {
  // The watcher only reads state.nodes; a real controller needs session plumbing.
  return { state: { nodes } } as TranscriptController;
}

/** The witnessed run: prompt node already present when the status flips busy. */
function runSession(): void {
  const store = useAppStore.getState();
  store.updateSession(sessionPath, { status: 'streaming' });
  store.updateSession(sessionPath, { status: 'tool_running' });
  store.updateSession(sessionPath, { status: 'idle' });
}

beforeEach(() => {
  vi.clearAllMocks();
  reportMock.mockResolvedValue({ success: true, task });
  useAppStore.setState({ sessions: new Map(), tasks: [task] });
  useAppStore.getState().addSession(sessionPath, task.path);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startTaskDirSuggestions', () => {
  it('reports prompt-mentioned dirs even though the prompt node predates the busy flip', async () => {
    // addUserMessage appends the optimistic node before the session status
    // flips to busy; an index cursor taken at the flip would skip it.
    peekMock.mockReturnValue(
      controllerWith([userNode('fix the tests in /work/alpha please', Date.now())]),
    );
    const stop = startTaskDirSuggestions();
    runSession();
    await Promise.resolve();
    stop();

    expect(reportMock).toHaveBeenCalledWith('/tasks/demo', ['/work/alpha'], 'prompt');
  });

  it('skips hydrated history, whose nodes keep their original old timestamps', async () => {
    const hourAgo = Date.now() - 3_600_000;
    peekMock.mockReturnValue(
      controllerWith([
        userNode('old prompt about /work/ancient', hourAgo),
        toolNode({ command: 'ls /work/ancient' }, hourAgo),
        userNode('new prompt about /work/fresh', Date.now()),
      ]),
    );
    const stop = startTaskDirSuggestions();
    runSession();
    await Promise.resolve();
    stop();

    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('/tasks/demo', ['/work/fresh'], 'prompt');
  });

  it('reports tool-touched paths as suggestions and skips cancelled tools', async () => {
    peekMock.mockReturnValue(
      controllerWith([
        userNode('hello', Date.now()),
        toolNode({ command: 'cat /work/beta/src/index.ts' }, Date.now()),
        toolNode({ command: 'cat /work/gamma' }, Date.now(), 'cancelled'),
        toolNode({ command: 'ls /work/no-time' }, undefined),
      ]),
    );
    const stop = startTaskDirSuggestions();
    runSession();
    await Promise.resolve();
    stop();

    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('/tasks/demo', ['/work/beta/src/index.ts'], 'tool');
  });

  it('reports mid-run on the interval, once per path, and nothing again at run end', async () => {
    vi.useFakeTimers();
    const nodes: TranscriptNode[] = [userNode('look at /work/alpha', Date.now())];
    peekMock.mockReturnValue(controllerWith(nodes));
    const stop = startTaskDirSuggestions();

    const store = useAppStore.getState();
    store.updateSession(sessionPath, { status: 'streaming' });
    await vi.advanceTimersByTimeAsync(1_600);
    // Still running, yet the prompt's dir is already on its way to main.
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('/tasks/demo', ['/work/alpha'], 'prompt');

    // A dir the tools touch mid-run follows on the next tick.
    nodes.push(toolNode({ command: 'cat /work/beta/index.ts' }, Date.now()));
    await vi.advanceTimersByTimeAsync(1_600);
    expect(reportMock).toHaveBeenCalledTimes(2);
    expect(reportMock).toHaveBeenCalledWith('/tasks/demo', ['/work/beta/index.ts'], 'tool');

    // A dir that lands after the last tick is still caught by the run-end scan.
    nodes.push(userNode('one more: /work/gamma', Date.now()));
    store.updateSession(sessionPath, { status: 'idle' });
    expect(reportMock).toHaveBeenCalledTimes(3);
    expect(reportMock).toHaveBeenCalledWith('/tasks/demo', ['/work/gamma'], 'prompt');

    stop();
    // Teardown clears the interval: a live timer would report this late node.
    nodes.push(userNode('late /work/delta', Date.now()));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reportMock).toHaveBeenCalledTimes(3);
  });

  it('holds a running tool call until its args finish streaming', async () => {
    vi.useFakeTimers();
    const running = toolNode({ command: 'cat /work/alpha/index.ts' }, Date.now(), 'running');
    const nodes: TranscriptNode[] = [running];
    peekMock.mockReturnValue(controllerWith(nodes));
    const stop = startTaskDirSuggestions();

    const store = useAppStore.getState();
    store.updateSession(sessionPath, { status: 'streaming' });
    await vi.advanceTimersByTimeAsync(3_200);
    // Two ticks passed; a running call's args may still be truncated.
    expect(reportMock).not.toHaveBeenCalled();

    running.status = 'success';
    await vi.advanceTimersByTimeAsync(1_600);
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('/tasks/demo', ['/work/alpha/index.ts'], 'tool');
    stop();
  });

  it('does nothing for sessions without a transcript controller or a matching task', async () => {
    peekMock.mockReturnValue(undefined);
    useAppStore.getState().addSession('/sessions/other.jsonl', '/not/a/task');
    useAppStore.getState().updateSession('/sessions/other.jsonl', { status: 'streaming' });
    useAppStore.getState().updateSession('/sessions/other.jsonl', { status: 'idle' });
    const stop = startTaskDirSuggestions();
    runSession();
    await Promise.resolve();
    stop();

    expect(reportMock).not.toHaveBeenCalled();
  });
});
