/**
 * Vitest setup: a baseline preload bridge.
 *
 * The settings store reads pigi's settings file through `window.piApi` while the
 * module is evaluated, so a test that imports anything touching the store needs
 * those members to exist first. This file runs before every test module for that
 * reason; tests that care about the value install `installPigiSettingsBridge`
 * instead. Node-environment tests have no window and skip it.
 */
import {
  PIGI_SETTINGS_READ_STATE,
  parsePigiSettings,
  type PigiSettings,
} from '../../../shared/pigiSettings';

/**
 * The snapshot subscribers of the running page.
 *
 * It lives here, not in `installPigiSettingsBridge`, because the store
 * subscribes while its module is evaluated — before any test installs a bridge.
 * Sharing the registry means a later `broadcast` still reaches that subscriber,
 * exactly like the real preload's `onPigiSettingsChanged`.
 */
export const pigiSettingsListeners = new Set<(settings: PigiSettings) => void>();

export function emitPigiSettingsSnapshot(settings: PigiSettings): void {
  for (const listener of pigiSettingsListeners) {
    listener(settings);
  }
}

if (typeof window !== 'undefined' && !('piApi' in window)) {
  Object.defineProperty(window, 'piApi', {
    value: {
      readPigiSettings: () => ({ state: PIGI_SETTINGS_READ_STATE.missing }),
      changePigiSettings: (change: unknown): Promise<PigiSettings> =>
        Promise.resolve(
          parsePigiSettings({
            ...parsePigiSettings({}),
            ...(typeof change === 'object' && change !== null ? change : {}),
          }),
        ),
      onPigiSettingsChanged: (callback: (settings: PigiSettings) => void): (() => void) => {
        pigiSettingsListeners.add(callback);
        return () => {
          pigiSettingsListeners.delete(callback);
        };
      },
    },
    configurable: true,
    writable: true,
  });
}
