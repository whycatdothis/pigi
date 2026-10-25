/**
 * pigi's own settings file: `settings.json` in the app's user data directory.
 *
 * The main process reads it before it creates the window, because the native
 * theme and the window background come from it, and the preload reads the same
 * file so the renderer gets a synchronous value for its first paint. Neither
 * step is allowed to depend on an async round trip happening before the first
 * frame, which is how the old localStorage read avoided a theme flash.
 *
 * Writes are atomic: a half-written file would drop every appearance setting,
 * and a temp file plus rename costs nothing at this size.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DEFAULT_PIGI_SETTINGS,
  parsePigiSettings,
  type PigiSettings,
} from '../shared/pigiSettings';
import { deriveTokens, resolveAppearance } from '../shared/appearanceTokens';
import { formatHex, parseCssColor } from '../shared/colorMath';

/** File name inside `app.getPath('userData')`. */
export const PIGI_SETTINGS_FILE_NAME = 'settings.json';

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * Reads and normalizes the file. `exists` is false when there is nothing on
 * disk, which is how the renderer knows to migrate its old localStorage value
 * instead of starting from defaults.
 */
export function readPigiSettingsFile(path: string): { settings: PigiSettings; exists: boolean } {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (!isMissingFileError(error)) {
      console.error('Failed to read pigi settings:', error);
    }
    return { settings: DEFAULT_PIGI_SETTINGS, exists: false };
  }

  try {
    return { settings: parsePigiSettings(JSON.parse(raw)), exists: true };
  } catch (error) {
    // A corrupt file should not lock the user out of the settings page: the
    // next write replaces it.
    console.error('Failed to parse pigi settings; using defaults:', error);
    return { settings: DEFAULT_PIGI_SETTINGS, exists: true };
  }
}

export function writePigiSettingsFile(path: string, settings: PigiSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, path);
}

/**
 * The opaque background the window paints before the renderer has any pixels,
 * derived from the same tokens the renderer will use so the frame before the
 * first paint does not flash a different colour. macOS uses a vibrant window
 * instead and ignores this.
 */
export function windowBackgroundFor(settings: PigiSettings, systemIsDark: boolean): string {
  const resolved = resolveAppearance(settings.appearance, {
    systemIsDark,
    systemPrefersReducedMotion: false,
  });
  const background = parseCssColor(deriveTokens(resolved)['--app-background']);
  return background ? formatHex(background) : '#ffffff';
}
