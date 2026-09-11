/**
 * Electron main process entry point.
 *
 * - Spawns pi-agent utility process (no sessions yet, just the process)
 * - Sessions are created on-demand from renderer
 * - Each session gets control/data MessagePorts for commands and streaming
 */
import { app, BrowserWindow, ipcMain, net, protocol, shell, systemPreferences } from 'electron';
import { electronApp } from '@electron-toolkit/utils';
import { refreshApplicationMenu, setupApplicationMenu } from './menus/applicationMenu';
import { createMainWindow } from './windows/createMainWindow';
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
import { PiChannel, type AppInfo } from '../shared/ipcContract';
import { configureDebugPanel, installMainDebugHandle } from './debugConfig';
import { initializeShellEnv } from './processes/shellEnvResolver';

configureDebugPanel();
installMainDebugHandle({ piAgent: getPiAgentDebugSnapshot });

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, supportFetchAPI: true } },
]);

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pigi');

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

  ipcMain.handle(PiChannel.GetAccentColor, () => {
    // macOS 10.14+: returns system accent color as RGBA hex (#RRGGBBAA).
    const accent = systemPreferences.getAccentColor();
    return accent || null;
  });

  ipcMain.handle(PiChannel.GetAppInfo, (): AppInfo => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? '',
      chromeVersion: process.versions.chrome ?? '',
      nodeVersion: process.versions.node ?? '',
    };
  });

  openMainWindow();
  scheduleBackgroundUpdateChecks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
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
function openMainWindow(): void {
  const win = createMainWindow();
  win.on('closed', () => {
    stopTerminalProcess();
  });
}
