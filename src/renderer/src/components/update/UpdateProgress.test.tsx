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

function installUpdateApi(initialStatus: UpdateStatus): {
  setContentHeight: ReturnType<typeof vi.fn<(height: number) => void>>;
  dismissWindow: ReturnType<typeof vi.fn<() => void>>;
  cancelDownload: ReturnType<typeof vi.fn<() => void>>;
} {
  const setContentHeight = vi.fn<(height: number) => void>();
  const dismissWindow = vi.fn<() => void>();
  const cancelDownload = vi.fn<() => void>();
  vi.stubGlobal('piApi', {
    update: {
      getStatus: vi.fn().mockResolvedValue(initialStatus),
      check: vi.fn(),
      cancelDownload,
      dismissWindow,
      quitAndInstall: vi.fn(),
      setProgressWindowContentHeight: setContentHeight,
      onStatus: () => () => {},
    },
  });
  return { setContentHeight, dismissWindow, cancelDownload };
}

/** Let the status promise resolve and React re-render. */
async function flush(): Promise<void> {
  await act(async () => {});
}

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
    const { setContentHeight } = installUpdateApi({
      phase: 'downloading',
      version: '0.4.22',
      percent: 36,
      transferredBytes: 60_000_000,
      totalBytes: 167_000_000,
      bytesPerSecond: 10_000_000,
    });

    render(<UpdateProgress />);
    await flush();

    expect(setContentHeight).toHaveBeenCalledWith(CONTENT_HEIGHT);
  });

  it('reports nothing before the first status, so the window keeps its default', async () => {
    const { setContentHeight } = installUpdateApi({ phase: 'checking' });

    render(<UpdateProgress />);

    expect(setContentHeight).not.toHaveBeenCalled();
    await flush();
    expect(setContentHeight).toHaveBeenCalledWith(CONTENT_HEIGHT);
  });

  it('counts down the seconds before it closes itself', async () => {
    vi.useFakeTimers();
    installUpdateApi({ phase: 'up_to_date' });

    render(<UpdateProgress />);
    await flush();
    expect(screen.getByText('auto closing in 2s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('auto closing in 1s')).toBeInTheDocument();
  });

  it('closes on "Later" without cancelling the finished download', async () => {
    const { dismissWindow, cancelDownload } = installUpdateApi({
      phase: 'downloaded',
      version: '0.4.22',
    });

    render(<UpdateProgress />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(dismissWindow).toHaveBeenCalledTimes(1);
    expect(cancelDownload).not.toHaveBeenCalled();
  });

  it('cancels an in-flight download from its own button', async () => {
    const { cancelDownload, dismissWindow } = installUpdateApi({
      phase: 'downloading',
      version: '0.4.22',
      percent: 10,
      transferredBytes: 16_700_000,
      totalBytes: 167_000_000,
      bytesPerSecond: 10_000_000,
    });

    render(<UpdateProgress />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(cancelDownload).toHaveBeenCalledTimes(1);
    expect(dismissWindow).not.toHaveBeenCalled();
  });
});
