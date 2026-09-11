import { app, BrowserWindow, ipcMain, type BrowserWindow as BrowserWindowType } from 'electron';
import { is } from '@electron-toolkit/utils';

declare const __PIGI_DEBUG_PANEL__: boolean;

const DEBUG_PANEL_ENV = 'PIGI_DEBUG_PANEL';
const DEBUG_PANEL_ENABLED_VALUE = '1';
const REMOTE_DEBUGGING_PORT = '9222';
const DEVTOOLS_MODE = 'detach';

export function isDebugPanelEnabled(): boolean {
  return __PIGI_DEBUG_PANEL__ || process.env[DEBUG_PANEL_ENV] === DEBUG_PANEL_ENABLED_VALUE;
}

export function configureDebugPanel(): void {
  if (is.dev || isDebugPanelEnabled()) {
    app.commandLine.appendSwitch('remote-debugging-port', REMOTE_DEBUGGING_PORT);
  }
}

export function openDebugPanel(window: BrowserWindowType): void {
  if (!isDebugPanelEnabled()) {
    return;
  }

  window.webContents.once('did-finish-load', () => {
    window.webContents.openDevTools({ mode: DEVTOOLS_MODE });
  });
}

/**
 * Dev-only `globalThis.__pigi` for the main-process inspector (`npm run dev`
 * passes `--inspect 9229`; `node scripts/cdp.mjs --main eval ...` reaches it).
 * The renderer counterpart lives in src/renderer/src/lib/debugHandle.ts.
 */
export function installMainDebugHandle(snapshotProviders: {
  piAgent: () => Record<string, unknown>;
}): void {
  if (!is.dev) {
    return;
  }

  const handle = {
    app,
    BrowserWindow,
    ipcMain,
    snapshot: (): Record<string, unknown> => ({
      windows: BrowserWindow.getAllWindows().map((window) => ({
        id: window.id,
        title: window.getTitle(),
        bounds: window.getBounds(),
        focused: window.isFocused(),
        visible: window.isVisible(),
        url: window.webContents.getURL(),
      })),
      piAgent: snapshotProviders.piAgent(),
    }),
  };
  Object.assign(globalThis, { __pigi: handle });
}
