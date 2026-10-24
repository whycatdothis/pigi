/**
 * Auto-update, driven by electron-updater against GitHub Releases.
 *
 * The running app only ever checks and downloads; installing is a user action
 * (`autoInstallOnAppQuit` is off, `autoDownload` too). Two paths share one
 * status:
 *
 *   silent  — on launch and every two hours (spread by a few minutes of
 *             jitter). A found update downloads with no UI; the blue dot in
 *             Settings is the only announcement.
 *   manual  — from Settings. A found update shows the progress window, which
 *             carries the progress bar, Cancel, and Install and Restart.
 *
 * Every renderer gets the status pushed on change and can read it back on
 * demand, so a window that opens mid-download still shows the right thing.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import type { ProgressInfo } from 'electron-updater';
import { PiChannel, type UpdateStatus } from '../../shared/ipcContract';
import {
  closeUpdateProgressWindow,
  closeUpdateProgressWindowAfter,
  openUpdateProgressWindow,
} from '../windows/createUpdateProgressWindow';

// electron-updater's `autoUpdater` is defined with an arrow-function getter,
// which Node's CJS→ESM interop skips, so a named import would be undefined at
// runtime. The default import is `module.exports`, which does expose it.
const { autoUpdater, CancellationToken } = electronUpdater;

/** A launch check waits for the app to settle first; users notice a spinner. */
const FIRST_BACKGROUND_CHECK_DELAY_MS = 15 * 1000;
const BACKGROUND_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
/**
 * Each interval is nudged by up to this much either way. Instances that start
 * at the same time would otherwise poll — and on release day download — in
 * lockstep forever, which turns a steady trickle into one synchronized spike.
 */
const BACKGROUND_CHECK_JITTER_MS = 10 * 60 * 1000;
/** How long "pigi is up to date" stays on screen before the window closes. */
const UP_TO_DATE_LINGER_MS = 1000;

let status: UpdateStatus = { phase: 'idle' };
/** Set while a download runs; doubles as the guard against a second one. */
let downloadToken: InstanceType<typeof CancellationToken> | null = null;
let downloadVersion: string | null = null;
let checkInFlight = false;
/** Whether the current check came from Settings (opens the progress window). */
let manualCheck = false;
/** Rebuilds the app menu after a status change; set once during startup. */
let statusObserver: (() => void) | null = null;

/**
 * electron-updater swaps a packaged, signed bundle, and the publish config only
 * carries a macOS target. A dev run has neither, and asking it for updates
 * would only log errors, so it reports `unsupported`.
 */
function isSupported(): boolean {
  return app.isPackaged && process.platform === 'darwin';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the progress window still has something to show after a check. Read
 * through a function so it sees the status the event listeners just published,
 * not the narrowed value this function started with.
 */
function hasDownloadToShow(): boolean {
  return status.phase === 'downloading' || status.phase === 'downloaded';
}

function publish(next: UpdateStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(PiChannel.UpdateStatusChanged, next);
  }
  // The app menu renders the same status; it ignores pushes that leave its one
  // update item unchanged, which is every progress tick.
  statusObserver?.();
}

async function startDownload(version: string): Promise<void> {
  if (downloadToken !== null) return;
  if (status.phase === 'downloaded') return;

  if (manualCheck) {
    openUpdateProgressWindow();
  }

  const token = new CancellationToken();
  downloadToken = token;
  downloadVersion = version;
  publish({
    phase: 'downloading',
    version,
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
  });

  try {
    await autoUpdater.downloadUpdate(token);
  } catch (error) {
    // A cancelled download rejects with the error it was cancelled by;
    // cancelUpdateDownload already reset the status and closed the window.
    if (token.cancelled) return;
    if (status.phase === 'downloading') {
      publish({ phase: 'error', message: describeError(error) });
    }
  }
}

async function runCheck(interactive: boolean): Promise<UpdateStatus> {
  if (!isSupported()) return status;

  // Nothing to check: a download is running or finished, so the caller (the
  // progress window's opener, or Settings) gets the state it should show.
  if (downloadToken !== null || checkInFlight || status.phase === 'downloaded') {
    if (interactive && downloadToken !== null) {
      openUpdateProgressWindow();
    }
    return status;
  }

  checkInFlight = true;
  manualCheck = interactive;
  if (interactive) {
    // The window is the feedback for a manual check: it opens on "Checking for
    // updates" instead of appearing seconds later, once a download starts.
    publish({ phase: 'checking' });
    openUpdateProgressWindow();
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    // The 'error' listener normally reports this first; keep the promise's
    // rejection from leaving the renderer staring at 'checking'.
    if (status.phase === 'checking') {
      publish({ phase: 'error', message: describeError(error) });
    }
  } finally {
    checkInFlight = false;
    manualCheck = false;
  }

  // A check that found nothing has no download to show. "Up to date" is
  // reported by the window itself, so it stays put long enough to be read; an
  // error closes it at once and explains itself as a toast in the main window.
  if (interactive) {
    if (status.phase === 'up_to_date') {
      closeUpdateProgressWindowAfter(UP_TO_DATE_LINGER_MS);
    } else if (!hasDownloadToShow()) {
      closeUpdateProgressWindow();
    }
  }

  return status;
}

function cancelUpdateDownload(): void {
  const token = downloadToken;
  downloadToken = null;
  downloadVersion = null;
  token?.cancel();
  if (status.phase === 'downloading') {
    publish({ phase: 'idle' });
  }
  closeUpdateProgressWindow();
}

function installDownloadedUpdate(): void {
  if (status.phase !== 'downloaded') return;
  autoUpdater.quitAndInstall();
}

/** What the app menu's single update item should say right now. */
export interface UpdateMenuItemState {
  label: string;
  enabled: boolean;
}

export function getUpdateMenuItemState(): UpdateMenuItemState {
  switch (status.phase) {
    case 'unsupported':
      return { label: 'Check for Updates…', enabled: false };
    case 'checking':
      return { label: 'Checking for Updates…', enabled: false };
    case 'downloading':
      return { label: `Downloading pigi ${status.version}…`, enabled: true };
    case 'downloaded':
      return { label: `Update to ${status.version}…`, enabled: true };
    case 'idle':
    case 'up_to_date':
    case 'error':
      return { label: 'Check for Updates…', enabled: true };
  }
}

/**
 * The menu mirrors the Settings entry: check now, or bring the progress window
 * forward when a download is running or waiting. Installing stays a click in
 * that window so the failure path keeps its single reporter (the renderer's
 * install-requested toast); main never installs on its own.
 */
export function runUpdateMenuItemAction(): void {
  if (status.phase === 'downloading' || status.phase === 'downloaded') {
    openUpdateProgressWindow();
    return;
  }
  void runCheck(true);
}

/** Registers the menu rebuild hook and applies it to the current status. */
export function setUpdateStatusObserver(observer: (() => void) | null): void {
  statusObserver = observer;
  observer?.();
}

export function initializeUpdateManager(): void {
  status = isSupported() ? { phase: 'idle' } : { phase: 'unsupported' };

  ipcMain.handle(PiChannel.GetUpdateStatus, () => status);
  ipcMain.handle(PiChannel.CheckForUpdates, () => runCheck(true));
  ipcMain.on(PiChannel.CancelUpdateDownload, () => cancelUpdateDownload());
  ipcMain.on(PiChannel.QuitAndInstallUpdate, () => installDownloadedUpdate());

  if (!isSupported()) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => publish({ phase: 'checking' }));

  autoUpdater.on('update-not-available', () => publish({ phase: 'up_to_date' }));

  autoUpdater.on('update-available', (info) => {
    void startDownload(info.version);
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    if (downloadVersion === null) return;
    publish({
      phase: 'downloading',
      version: downloadVersion,
      percent: progress.percent,
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    downloadToken = null;
    downloadVersion = null;
    publish({ phase: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (error) => {
    downloadToken = null;
    downloadVersion = null;
    publish({ phase: 'error', message: describeError(error) });
  });
}

/**
 * Launch check, then one roughly every two hours. Silent: no window, no toasts.
 *
 * A self-rescheduling timeout rather than `setInterval`, because each round gets
 * its own delay; a fixed interval would keep every instance on the same phase
 * relative to its launch time.
 */
export function scheduleBackgroundUpdateChecks(): void {
  if (!isSupported()) return;

  setTimeout(() => {
    void runCheck(false);
  }, FIRST_BACKGROUND_CHECK_DELAY_MS);

  const scheduleNext = (): void => {
    const jitter = (Math.random() * 2 - 1) * BACKGROUND_CHECK_JITTER_MS;
    setTimeout(() => {
      void runCheck(false);
      scheduleNext();
    }, BACKGROUND_CHECK_INTERVAL_MS + jitter);
  };
  scheduleNext();
}
