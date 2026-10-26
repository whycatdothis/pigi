/**
 * The update progress window: a small titled window over the main window,
 * showing download progress, Cancel, and (when the download lands) Install and
 * Restart. It loads the same renderer bundle and picks its UI from the hash.
 *
 * The window hugs its content: the renderer measures what the current status
 * needs and reports a height, and the window is sized to it. A fixed box would
 * either clip a long error or sit half empty.
 */
import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { PiChannel } from '../../shared/ipcContract';
import { UPDATE_PROGRESS_HASH } from '../../shared/routes';
import { getMainWindow } from './createMainWindow';

const WIDTH = 400;
/** First paint's content height, before the renderer has measured anything. */
const INITIAL_HEIGHT = 72;
/** Keeps a bad measurement from producing a window nobody can use. */
const MIN_HEIGHT = 72;
const MAX_HEIGHT = 260;
/** The window's title; the renderer's own <title> would replace it. */
const WINDOW_TITLE = 'Updating pigi';
/**
 * Where the window sits over the main window: centred horizontally, and a
 * tenth of the way down. High enough to read without covering the middle of the
 * conversation, and paired with a top-anchored resize so the status line never
 * moves as the content grows.
 */
const TOP_FRACTION = 0.1;
/**
 * How long to wait for the first measurement before showing the window at its
 * initial size. The report normally arrives first; this only covers a renderer
 * that failed to mount.
 */
const SHOW_WITHOUT_MEASUREMENT_MS = 400;

let updateProgressWindow: BrowserWindow | null = null;
let contentHeight: number | null = null;
let readyToShow = false;
let shown = false;
let showFallbackTimer: NodeJS.Timeout | null = null;
/** A pending "close after the answer has been read" timer, if one is armed. */
let closeTimer: NodeJS.Timeout | null = null;

/**
 * Size the window to its content. Called with whatever the renderer measured,
 * which changes with the status: one line for a check, a progress bar and a
 * button row for a download.
 */
export function setUpdateProgressContentHeight(height: number): void {
  const progressWindow = updateProgressWindow;
  if (progressWindow === null || progressWindow.isDestroyed()) return;

  const next = Math.min(Math.max(Math.round(height), MIN_HEIGHT), MAX_HEIGHT);
  if (next !== contentHeight) {
    contentHeight = next;
    progressWindow.setContentSize(WIDTH, next);
  }
  showWhenMeasured();
}

function positionOverParent(progressWindow: BrowserWindow, parent: BrowserWindow | null): void {
  if (parent === null) {
    progressWindow.center();
    return;
  }
  const parentBounds = parent.getBounds();
  const [width] = progressWindow.getSize();
  progressWindow.setPosition(
    Math.round(parentBounds.x + (parentBounds.width - width) / 2),
    Math.round(parentBounds.y + parentBounds.height * TOP_FRACTION),
  );
}

function clearShowFallback(): void {
  if (showFallbackTimer === null) return;
  clearTimeout(showFallbackTimer);
  showFallbackTimer = null;
}

function showProgressWindow(): void {
  const progressWindow = updateProgressWindow;
  if (shown || progressWindow === null || progressWindow.isDestroyed()) return;
  shown = true;
  clearShowFallback();
  progressWindow.show();
}

/** Shows once the first paint is ready; the fallback timer covers one that is not. */
function showWhenMeasured(): void {
  if (readyToShow) showProgressWindow();
}

export function openUpdateProgressWindow(): BrowserWindow {
  // Anything the window was waiting to do no longer applies: it is about to
  // show the status the caller just published.
  cancelScheduledUpdateProgressWindowClose();
  // A timer left over from a window closed within the last few hundred ms would
  // otherwise pop this one up unpainted.
  clearShowFallback();

  const existing = updateProgressWindow;
  if (existing !== null && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const parent = getMainWindow();
  const liveParent = parent !== null && !parent.isDestroyed() ? parent : null;
  contentHeight = null;
  readyToShow = false;
  shown = false;

  const progressWindow = new BrowserWindow({
    width: WIDTH,
    height: INITIAL_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // A titled window on purpose: this replaces the app, so it reads as a system
    // dialog rather than a floating panel, and the red button is the way out.
    title: WINDOW_TITLE,
    show: false,
    // Content-sized, so `height` here and `setContentSize` below mean the same
    // thing. Without it the initial height would carry the title bar and the
    // first frame would clip the bottom.
    useContentSize: true,
    ...(liveParent !== null ? { parent: liveParent } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  positionOverParent(progressWindow, liveParent);

  progressWindow.on('closed', () => {
    clearShowFallback();
    if (updateProgressWindow === progressWindow) {
      updateProgressWindow = null;
    }
  });

  // The renderer is the app's own bundle, so its <title> would rename the
  // window to "pigi". This window is about the update, not the app.
  progressWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  progressWindow.setTitle(WINDOW_TITLE);

  progressWindow.once('ready-to-show', () => {
    readyToShow = true;
    showWhenMeasured();
  });

  // Armed here rather than on "ready-to-show": a renderer that never finishes
  // loading would otherwise leave no window and no explanation at all.
  showFallbackTimer = setTimeout(showProgressWindow, SHOW_WITHOUT_MEASUREMENT_MS);

  // The window is a fixed 400px box with a status bar, not a document: zooming
  // it only clips the buttons, and the View menu zooms whatever has focus.
  progressWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  const resetZoom = (): void => {
    progressWindow.webContents.setZoomFactor(1);
  };
  progressWindow.on('show', resetZoom);
  progressWindow.on('focus', resetZoom);

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    progressWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${UPDATE_PROGRESS_HASH}`);
  } else {
    progressWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: UPDATE_PROGRESS_HASH,
    });
  }

  updateProgressWindow = progressWindow;
  return progressWindow;
}

export function closeUpdateProgressWindow(): void {
  cancelScheduledUpdateProgressWindowClose();
  const progressWindow = updateProgressWindow;
  updateProgressWindow = null;
  if (progressWindow !== null && !progressWindow.isDestroyed()) {
    progressWindow.close();
  }
}

/**
 * Close the window after a delay, unless the status moves on first: the answer
 * to a check is only worth holding on screen briefly, and a check that starts
 * again owns the window from then on.
 */
export function scheduleUpdateProgressWindowClose(delayMs: number): void {
  if (updateProgressWindow === null) return;
  cancelScheduledUpdateProgressWindowClose();
  const target = updateProgressWindow;
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (updateProgressWindow !== target) return;
    closeUpdateProgressWindow();
  }, delayMs);
}

/** Drops a pending close, for a status that has something newer to show. */
export function cancelScheduledUpdateProgressWindowClose(): void {
  if (closeTimer === null) return;
  clearTimeout(closeTimer);
  closeTimer = null;
}

/** Wires the renderer's measurement to the window. Called once at startup. */
export function registerUpdateProgressWindowIpc(): void {
  ipcMain.on(PiChannel.UpdateProgressContentHeight, (event, height: number) => {
    if (typeof height !== 'number' || !Number.isFinite(height)) return;
    // Only the progress window sizes itself; the main window's renderer shares
    // this bundle but has no business moving this window.
    const progressWindow = updateProgressWindow;
    if (progressWindow === null || event.sender !== progressWindow.webContents) return;
    setUpdateProgressContentHeight(height);
  });
}
