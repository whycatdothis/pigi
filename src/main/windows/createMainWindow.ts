import { BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { PIGI_SETTINGS_PATH_ARGUMENT } from '../../shared/pigiSettings';
import { is } from '@electron-toolkit/utils';
import icon from '../../../resources/icon.png?asset';
import { openDebugPanel } from '../debugConfig';
import { guardWindowNavigation } from './windowNavigation';

let mainWindow: BrowserWindow | null = null;

/**
 * Wide enough for the left sidebar plus the full 960px chat column; on a laptop
 * the screen fraction wins.
 */
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;
const MAX_SCREEN_FRACTION = 0.9;

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
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(DEFAULT_WIDTH, Math.round(workArea.width * MAX_SCREEN_FRACTION)),
    height: Math.min(DEFAULT_HEIGHT, Math.round(workArea.height * MAX_SCREEN_FRACTION)),
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

  guardWindowNavigation(mainWindow.webContents, join(__dirname, '../renderer/index.html'));

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  openDebugPanel(mainWindow);

  return mainWindow;
}
