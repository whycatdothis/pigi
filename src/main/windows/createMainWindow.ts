/**
 * Create and configure the main BrowserWindow.
 */
import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { PIGI_SETTINGS_PATH_ARGUMENT } from '../../shared/pigiSettings';
import { is } from '@electron-toolkit/utils';
import icon from '../../../resources/icon.png?asset';
import { openDebugPanel } from '../debugConfig';
import { guardWindowNavigation } from './windowNavigation';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow({
  settingsPath,
  backgroundColor,
}: {
  settingsPath: string;
  backgroundColor: string;
}): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 680,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    ...(process.platform === 'darwin'
      ? { vibrancy: 'menu', backgroundColor: '#00000000' }
      : { backgroundColor }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      scrollBounce: process.platform === 'darwin',
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // A path, not the settings themselves: argv is fixed at window creation,
      // so passing the values would go stale on the first renderer reload. The
      // preload reads the file itself, synchronously.
      additionalArguments: [`${PIGI_SETTINGS_PATH_ARGUMENT}${settingsPath}`],
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
  guardWindowNavigation(mainWindow.webContents, join(__dirname, '../renderer/index.html'));

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  openDebugPanel(mainWindow);

  return mainWindow;
}
