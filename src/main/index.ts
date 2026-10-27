/**
 * Electron main process entry point.
 *
 * - Spawns pi-agent utility process (no sessions yet, just the process)
 * - Sessions are created on-demand from renderer
 * - Each session gets control/data MessagePorts for commands and streaming
 */
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { electronApp } from '@electron-toolkit/utils';
import { refreshApplicationMenu, setupApplicationMenu } from './menus/applicationMenu';
import { createMainWindow, getMainWindow } from './windows/createMainWindow';
import {
  stopAllProcesses,
  registerIpcHandlers,
  getPiAgentDebugSnapshot,
} from './ipc/piAgentBridge';
import { registerProjectHandlers } from './ipc/projectHandlers';
import { registerAttachmentHandlers } from './ipc/attachmentHandlers';
import { registerShortcutHandlers } from './ipc/shortcutHandlers';
import { registerTerminalHandlers, stopTerminalProcess } from './terminal/terminalManager';
import {
  initializeUpdateManager,
  scheduleBackgroundUpdateChecks,
  setUpdateStatusObserver,
} from './ipc/updateManager';
import { stopProjectFileSearch } from './projects/projectFileSearch';
import { PiChannel } from '../shared/ipcContract';
import { configureDebugPanel, installMainDebugHandle } from './debugConfig';
import { initializeShellEnv } from './processes/shellEnvResolver';
import {
  PIGI_SETTINGS_FILE_NAME,
  readPigiSettingsFile,
  windowBackgroundFor,
} from './pigiSettingsFile';
import { createPigiSettingsOwner, type PigiSettingsOwner } from './pigiSettingsOwner';
import { parsePigiSettingsChange } from '../shared/pigiSettings';
import { join } from 'node:path';

configureDebugPanel();
installMainDebugHandle({ piAgent: getPiAgentDebugSnapshot });

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, supportFetchAPI: true } },
]);

/** Set once the app is ready; `before-quit` flushes it. */
let settingsOwner: PigiSettingsOwner | null = null;

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pigi');

  // Read before the window exists: the native theme decides the window
  // material, and the background decides the frame painted before the renderer
  // has any pixels. Both used to wait for the renderer to say so.
  const settingsPath = join(app.getPath('userData'), PIGI_SETTINGS_FILE_NAME);
  const initialSettings = readPigiSettingsFile(settingsPath).settings;
  nativeTheme.themeSource = initialSettings.appearance.mode;

  // One owner: renderers send the slices they changed, main merges them onto
  // its copy, and every window receives the same snapshot. Both the main window
  // and the update progress window load this bundle, so the broadcast is what
  // keeps them from disagreeing.
  settingsOwner = createPigiSettingsOwner({
    path: settingsPath,
    onChanged: (settings) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(PiChannel.PigiSettingsChanged, settings);
        }
      }
    },
  });

  const owner = settingsOwner;
  ipcMain.handle(PiChannel.ChangePigiSettings, (_event, change: unknown) => {
    // The change is parsed here, not trusted: it keeps only the slices the
    // payload carries and normalizes them field by field.
    return owner.applyChange(parsePigiSettingsChange(change));
  });

  protocol.handle('local-file', (request) =>
    net.fetch('file://' + decodeURIComponent(request.url.slice('local-file://'.length))),
  );

  initializeShellEnv();
  registerIpcHandlers();
  registerProjectHandlers();
  registerAttachmentHandlers();
  registerShortcutHandlers();
  registerTerminalHandlers();
  initializeUpdateManager();
  // After the updater: the menu's one update item renders the current status.
  setupApplicationMenu();
  setUpdateStatusObserver(refreshApplicationMenu);

  ipcMain.on(PiChannel.OpenExternal, (_event, url: string) => {
    if (typeof url !== 'string') return;
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
  });

  ipcMain.on(PiChannel.SetAppearanceTheme, (_event, theme: string) => {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
      return;
    }
    // Drives the macOS vibrancy material, native menus, and the renderer's own
    // prefers-color-scheme, which the appearance engine sets to match.
    nativeTheme.themeSource = theme;
    const window = getMainWindow();
    if (process.platform === 'darwin' && window) {
      // An existing vibrant window does not repaint when the app appearance
      // changes; re-applying the material is what makes it follow.
      window.setVibrancy(null);
      window.setVibrancy('menu');
    }
  });

  openMainWindow(
    settingsPath,
    windowBackgroundFor(initialSettings, nativeTheme.shouldUseDarkColors),
  );
  scheduleBackgroundUpdateChecks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow(
        settingsPath,
        windowBackgroundFor(owner.current(), nativeTheme.shouldUseDarkColors),
      );
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // A renderer's pagehide invoke can lose this race, so the last change is
  // written here, synchronously, by the process that owns the file.
  settingsOwner?.flush();
  stopAllProcesses();
  stopTerminalProcess();
  stopProjectFileSearch();
});

/**
 * Open the main window and tie the terminal shells to its lifetime. When the
 * window (and its renderer) is destroyed, its PTYs are orphaned — on macOS the
 * app keeps running with no window — so kill them. This also prevents a fresh
 * renderer from colliding with stale terminal ids after a reopen.
 */
function openMainWindow(settingsPath: string, backgroundColor: string): void {
  const win = createMainWindow({ settingsPath, backgroundColor });
  win.on('closed', () => {
    stopTerminalProcess();
  });
}
