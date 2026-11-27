/**
 * Electron main process entry point.
 *
 * - Spawns pi-agent utility process (no sessions yet, just the process)
 * - Sessions are created on-demand from renderer
 * - Each session gets control/data MessagePorts for commands and streaming
 */
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, session, shell } from 'electron';
import { electronApp } from '@electron-toolkit/utils';
import { homedir } from 'node:os';
import { refreshApplicationMenu, setupApplicationMenu } from './menus/applicationMenu';
import { createMainWindow, getMainWindow } from './windows/createMainWindow';
import {
  stopAllProcesses,
  registerIpcHandlers,
  getPiAgentDebugSnapshot,
} from './ipc/piAgentBridge';
import { registerProjectHandlers } from './ipc/projectHandlers';
import { registerTaskHandlers } from './ipc/taskHandlers';
import { registerAttachmentHandlers } from './ipc/attachmentHandlers';
import { registerShortcutHandlers } from './ipc/shortcutHandlers';
import { registerPiPackageHandlers } from './ipc/piPackageHandlers';
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
import {
  readPigiSettingsForRenderer,
  pigiSettingsPath,
  readPigiSettingsFile,
  windowBackgroundFor,
} from './pigiSettingsFile';
import { createPigiSettingsOwner } from './pigiSettingsOwner';
import { startRemoteControlServer } from './remoteControl/remoteControlServer';
import { registerCliInstallHandlers, setCliInstallStateObserver } from './ipc/cliInstall';
import { parsePigiSettingsChange } from '../shared/pigiSettings';
import { initializeTelemetry, setTelemetryEnabled } from './telemetry';
import { pathToFileURL } from 'node:url';
import { PACKAGE_IMAGE_SCHEME } from '../shared/piPackages';
import { handlePackageImageRequest } from './packages/packageImages';
import { resolveLocalFile } from './protocols/localFile';

configureDebugPanel();
installMainDebugHandle({ piAgent: getPiAgentDebugSnapshot });

protocol.registerSchemesAsPrivileged([
  // `local-file` reads any path the renderer names. That is only sound because
  // the renderer never runs untrusted content: model output reaches the DOM
  // through escaped markdown, and this window never navigates (see
  // windows/windowNavigation.ts). The scheme carries no `bypassCSP` and no
  // `supportFetchAPI`: it feeds `<img>` and file links, which `img-src` allows
  // in the page's CSP, so a script in the page cannot fetch a local file even
  // if one ever ran there.
  { scheme: 'local-file' },
  { scheme: PACKAGE_IMAGE_SCHEME, privileges: { secure: true } },
]);

app.whenReady().then(() => {
  electronApp.setAppUserModelId('pink.pigi');

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

  // Synchronous on purpose: the renderer applies appearance before its first
  // paint. Same file and same read as `readPigiSettingsFile` above; this is the
  // renderer's copy, so a corrupt file is reported instead of replaced.
  ipcMain.on(PiChannel.ReadPigiSettings, (event) => {
    event.returnValue = readPigiSettingsForRenderer(settingsPath);
  });

  // The renderer's fallback project path. Answered from main because a
  // sandboxed preload has no `process.cwd()`.
  ipcMain.on(PiChannel.GetAppCwd, (event) => {
    event.returnValue = process.cwd();
  });

  // Display-only tilde shortening in the renderer; a sandboxed preload has no `os`.
  ipcMain.on(PiChannel.GetHomeDir, (event) => {
    event.returnValue = homedir();
  });

  // An image's file, never more: see protocols/localFile.ts for what is served.
  protocol.handle('local-file', async (request) => {
    const path = await resolveLocalFile(request.url);
    if (path === null) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(path).toString());
  });

  protocol.handle(PACKAGE_IMAGE_SCHEME, handlePackageImageRequest);

  // Resolves in the background so the window opens immediately; every fork
  // that inherits process.env awaits the same promise before spawning.
  void initializeShellEnv();
  initializeTelemetry({
    enabled: initialSettings.telemetry.enabled,
    toolView: initialSettings.chat.toolBlockViewMode,
  });
  registerIpcHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerAttachmentHandlers();
  registerShortcutHandlers();
  registerPiPackageHandlers();
  registerTerminalHandlers();
  registerCliInstallHandlers();
  denyUnneededWebPermissions();
  initializeUpdateManager();
  // After the updater: the menu's one update item renders the current status.
  setupApplicationMenu();
  setUpdateStatusObserver(refreshApplicationMenu);
  // The menu's command-line item follows the link the install writes.
  setCliInstallStateObserver(refreshApplicationMenu);

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

  openMainWindow(windowBackgroundFor(initialSettings, nativeTheme.shouldUseDarkColors));
  scheduleBackgroundUpdateChecks();

  const reopenMainWindow = (): void =>
    openMainWindow(windowBackgroundFor(settingsOwner.current(), nativeTheme.shouldUseDarkColors));
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
function openMainWindow(backgroundColor: string): void {
  const win = createMainWindow({ backgroundColor });
  win.on('closed', () => {
    stopTerminalProcess();
    stopProjectFileWatch();
  });
}

/**
 * The page needs no web permission — notifications, geolocation, media, USB —
 * and with no handler Electron grants whatever is asked for. The copy buttons
 * use the clipboard's sanitized write, which is the one exception.
 */
function denyUnneededWebPermissions(): void {
  const allowed = new Set<string>(['clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    allowed.has(permission),
  );
}
