/**
 * The update progress window: a small frameless sheet over the main window,
 * showing download progress, Cancel, and (when the download lands) Install and
 * Restart. It loads the same renderer bundle and picks its UI from the hash.
 */
import { BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { UPDATE_PROGRESS_HASH } from '../../shared/routes';
import { getMainWindow } from './createMainWindow';

const WIDTH = 420;
const HEIGHT = 200;

let updateProgressWindow: BrowserWindow | null = null;

export function openUpdateProgressWindow(): BrowserWindow {
  const existing = updateProgressWindow;
  if (existing !== null && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const parent = getMainWindow();
  const liveParent = parent !== null && !parent.isDestroyed() ? parent : null;
  const progressWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Frameless on purpose: it is a sheet, not a document window. The renderer
    // paints the whole surface, so the vibrancy below shows through the rounded
    // corners instead of a square system frame.
    frame: false,
    roundedCorners: true,
    show: false,
    center: true,
    title: 'Software Update',
    ...(process.platform === 'darwin'
      ? { vibrancy: 'menu', backgroundColor: '#00000000' }
      : { backgroundColor: '#ffffff' }),
    ...(liveParent !== null ? { parent: liveParent } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  progressWindow.on('closed', () => {
    if (updateProgressWindow === progressWindow) {
      updateProgressWindow = null;
    }
  });

  progressWindow.once('ready-to-show', () => {
    progressWindow.show();
  });

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
  const progressWindow = updateProgressWindow;
  updateProgressWindow = null;
  if (progressWindow !== null && !progressWindow.isDestroyed()) {
    progressWindow.close();
  }
}
