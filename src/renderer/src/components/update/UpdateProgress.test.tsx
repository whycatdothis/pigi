// @vitest-environment jsdom
import { installViewport } from '../../testing/jsdomSetup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UpdateStatus } from '../../../../shared/ipcContract';
import UpdateProgress from './UpdateProgress';

/**
 * The update window is the one surface a dev run cannot open (the updater
 * refuses to run unpackaged), so these tests are the only guard it has before a
 * release.
 */

const CONTENT_HEIGHT = 97;

interface UpdateApi {
  setContentHeight: ReturnType<typeof vi.fn<(height: number) => void>>;
  dismissWindow: ReturnType<typeof vi.fn<() => void>>;
  cancelDownload: ReturnType<typeof vi.fn<() => void>>;
  /** Push a status the way main does. */
  pushStatus: (status: UpdateStatus) => void;
  /** Let `getStatus` answer with the status the test started with. */
  answerStatus: () => Promise<void>;
}

function installUpdateApi(initialStatus: UpdateStatus): UpdateApi {
  const setContentHeight = vi.fn<(height: number) => void>();
  const dismissWindow = vi.fn<() => void>();
  const cancelDownload = vi.fn<() => void>();
  let subscriber: ((status: UpdateStatus) => void) | null = null;
  // The read is held open on purpose: a test needs to be able to land a push
  // before it, which is the case that used to lose the newer status.
  let answer: (status: UpdateStatus) => void = () => undefined;
  const pendingStatus = new Promise<UpdateStatus>((resolve) => {
    answer = resolve;
  });
  vi.stubGlobal('piApi', {
    update: {
      getStatus: vi.fn().mockReturnValue(pendingStatus),
      check: vi.fn(),
      cancelDownload,
      dismissWindow,
      quitAndInstall: vi.fn(),
      setProgressWindowContentHeight: setContentHeight,
      onStatus: (callback: (status: UpdateStatus) => void) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      },
    },
  });
  return {
    setContentHeight,
    dismissWindow,
    cancelDownload,
    pushStatus: (status) => subscriber?.(status),
    answerStatus: async () => {
      answer(initialStatus);
      await flush();
    },
  };
}

/** Let pending promises resolve and React re-render. */
async function flush(): Promise<void> {
  await act(async () => {});
}

const DOWNLOADING: UpdateStatus = {
  phase: 'downloading',
  version: '0.4.23',
  percent: 36,
  transferredBytes: 60_000_000,
  totalBytes: 167_000_000,
};

describe('UpdateProgress', () => {
  beforeEach(() => {
    installViewport({ width: 400, height: CONTENT_HEIGHT });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports the height of its content once a status arrives', async () => {
    // The window has no height of its own: without this report it opens at its
    // first guess and clips the buttons off a download.
    const api = installUpdateApi(DOWNLOADING);

    render(<UpdateProgress />);
    await api.answerStatus();

    expect(api.setContentHeight).toHaveBeenCalledWith(CONTENT_HEIGHT);
  });

  it('reports nothing before the first status, so the window keeps its default', async () => {
    const api = installUpdateApi({ phase: 'checking' });

    render(<UpdateProgress />);
    await flush();

    expect(api.setContentHeight).not.toHaveBeenCalled();
    await api.answerStatus();
    expect(api.setContentHeight).toHaveBeenCalledWith(CONTENT_HEIGHT);
  });

  it('keeps a pushed status when the read answers with an older one', async () => {
    const api = installUpdateApi({ phase: 'checking' });

    render(<UpdateProgress />);
    act(() => {
      api.pushStatus({ phase: 'downloaded', version: '0.9.9' });
    });
    await api.answerStatus();

    expect(screen.getByText('pigi 0.9.9 is ready')).toBeInTheDocument();
  });

  it('counts down the seconds before it closes itself', async () => {
    vi.useFakeTimers();
    const api = installUpdateApi({ phase: 'up_to_date' });

    render(<UpdateProgress />);
    await api.answerStatus();
    expect(screen.getByText('auto closing in 2s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('auto closing in 1s')).toBeInTheDocument();
  });

  it('closes on "Later" without cancelling the finished download', async () => {
    const api = installUpdateApi({ phase: 'downloaded', version: '0.4.23' });

    render(<UpdateProgress />);
    await api.answerStatus();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(api.dismissWindow).toHaveBeenCalledTimes(1);
    expect(api.cancelDownload).not.toHaveBeenCalled();
  });

  it('cancels an in-flight download from its own button', async () => {
    const api = installUpdateApi(DOWNLOADING);

    render(<UpdateProgress />);
    await api.answerStatus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.cancelDownload).toHaveBeenCalledTimes(1);
    expect(api.dismissWindow).not.toHaveBeenCalled();
  });

  it('closes on Escape without cancelling the download', async () => {
    const api = installUpdateApi(DOWNLOADING);

    render(<UpdateProgress />);
    await api.answerStatus();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(api.dismissWindow).toHaveBeenCalledTimes(1);
    expect(api.cancelDownload).not.toHaveBeenCalled();
  });
});
