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
import { stopProjectFileWatch } from './projects/projectFileWatch';
import { PiChannel } from '../shared/ipcContract';
import { configureDebugPanel, installMainDebugHandle } from './debugConfig';
import { initializeShellEnv } from './processes/shellEnvResolver';
import { pigiSettingsPath, readPigiSettingsFile, windowBackgroundFor } from './pigiSettingsFile';
import { createPigiSettingsOwner } from './pigiSettingsOwner';
import { startRemoteControlServer } from './remoteControl/remoteControlServer';
import { parsePigiSettingsChange } from '../shared/pigiSettings';
import { initializeTelemetry, setTelemetryEnabled } from './telemetry';
import { pathToFileURL } from 'node:url';

configureDebugPanel();
installMainDebugHandle({ piAgent: getPiAgentDebugSnapshot });

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, supportFetchAPI: true } },
]);

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pigi');

  // Read before the window exists: the native theme decides the window
  // material, and the background decides the frame painted before the renderer
  // has any pixels.
  const settingsPath = pigiSettingsPath();
  const initialSettings = readPigiSettingsFile(settingsPath).settings;
  nativeTheme.themeSource = initialSettings.appearance.mode;

  // One owner: renderers send the slices they changed and main merges them onto
  // its copy and writes it, so the file has one writer and the last change is
  // never sitting in a debounce when the app quits.
  const settingsOwner = createPigiSettingsOwner({ path: settingsPath });

  ipcMain.handle(PiChannel.ChangePigiSettings, (_event, change: unknown) => {
    // The change is parsed here, not trusted: it keeps only the slices the
    // payload carries and normalizes them field by field.
    const parsed = parsePigiSettingsChange(change);
    const settings = settingsOwner.applyChange(parsed);
    if (parsed.telemetry) setTelemetryEnabled(settings.telemetry.enabled);
  });

  // The path is one encodeURIComponent'd segment, so a literal `?` can only start
  // a query: a cache-busting one the renderer adds when a file changes on disk.
  protocol.handle('local-file', (request) => {
    const [encodedPath] = request.url.slice('local-file://'.length).split('?');
    return net.fetch(pathToFileURL(decodeURIComponent(encodedPath)).toString());
  });

  initializeShellEnv();
  initializeTelemetry({
    enabled: initialSettings.telemetry.enabled,
    toolView: initialSettings.chat.toolBlockViewMode,
  });
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

  const reopenMainWindow = (): void =>
    openMainWindow(
      settingsPath,
      windowBackgroundFor(settingsOwner.current(), nativeTheme.shouldUseDarkColors),
    );
  startRemoteControlServer({ getWindow: getMainWindow, openWindow: reopenMainWindow });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      reopenMainWindow();
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
  stopProjectFileWatch();
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
    stopProjectFileWatch();
  });
}
