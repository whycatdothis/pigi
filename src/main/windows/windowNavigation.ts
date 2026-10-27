/**
 * Keep a window on the app it belongs to.
 *
 * Renderer content comes from a model: a mermaid diagram can carry `click`
 * directives, and any of them can point at a URL. Strict mode makes mermaid draw
 * those as inert anchors, but an anchor without a target is a full navigation,
 * and a successful navigation replaces the app with a web page that has no
 * preload and no way back. So the window denies navigation it did not start
 * itself and hands the URL to the browser instead, where a link belongs.
 */
import { shell, type WebContents } from 'electron';
import { pathToFileURL } from 'url';

const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:']);

/**
 * The app's own URL: the dev server while developing, the packed
 * `renderer/index.html` otherwise. Anything else is outside the app.
 */
function appEntryUrl(rendererIndexPath: string): URL {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    try {
      return new URL(devServerUrl);
    } catch {
      // A malformed dev URL leaves the file build as the only app entry.
    }
  }
  return pathToFileURL(rendererIndexPath);
}

function isAppUrl(candidate: string, appEntry: URL): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (url.protocol !== appEntry.protocol) {
    return false;
  }
  if (appEntry.protocol !== 'file:') {
    // A dev server serves the app from every path on its origin.
    return url.origin === appEntry.origin;
  }
  return url.pathname === appEntry.pathname;
}

function openExternally(candidate: string): void {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return;
  }
  if (EXTERNAL_SCHEMES.has(url.protocol)) {
    void shell.openExternal(candidate);
  }
}

/**
 * Deny every navigation the app did not ask for. `rendererIndexPath` is the
 * packed build's entry file, which the window also loads by itself.
 */
export function guardWindowNavigation(webContents: WebContents, rendererIndexPath: string): void {
  const appEntry = appEntryUrl(rendererIndexPath);

  const handle = (event: { preventDefault: () => void }, url: string): void => {
    if (isAppUrl(url, appEntry)) {
      return;
    }
    event.preventDefault();
    openExternally(url);
  };

  webContents.on('will-navigate', (event, url) => {
    handle(event, url);
  });
  webContents.on('will-redirect', (event, url) => {
    handle(event, url);
  });
}
