/**
 * Auto-update, driven by electron-updater against GitHub Releases.
 *
 * The running app only ever checks and downloads; installing is a user action
 * (`autoInstallOnAppQuit` is off, `autoDownload` too). Two paths share one
 * status:
 *
 *   silent  — on launch and every two hours. A found update downloads with no
 *             UI; the blue dot in Settings is the only announcement.
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
  openUpdateProgressWindow,
} from '../windows/createUpdateProgressWindow';

// electron-updater's `autoUpdater` is defined with an arrow-function getter,
// which Node's CJS→ESM interop skips, so a named import would be undefined at
// runtime. The default import is `module.exports`, which does expose it.
const { autoUpdater, CancellationToken } = electronUpdater;

/** A launch check waits for the app to settle first; users notice a spinner. */
const FIRST_BACKGROUND_CHECK_DELAY_MS = 15 * 1000;
const BACKGROUND_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;

let status: UpdateStatus = { phase: 'idle' };
/** Set while a download runs; doubles as the guard against a second one. */
let downloadToken: InstanceType<typeof CancellationToken> | null = null;
let downloadVersion: string | null = null;
let checkInFlight = false;
/** Whether the current check came from Settings (opens the progress window). */
let manualCheck = false;

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

function publish(next: UpdateStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(PiChannel.UpdateStatusChanged, next);
  }
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

/** Launch check, then one every two hours. Silent: no window, no toasts. */
export function scheduleBackgroundUpdateChecks(): void {
  if (!isSupported()) return;

  setTimeout(() => {
    void runCheck(false);
  }, FIRST_BACKGROUND_CHECK_DELAY_MS);

  setInterval(() => {
    void runCheck(false);
  }, BACKGROUND_CHECK_INTERVAL_MS);
}
