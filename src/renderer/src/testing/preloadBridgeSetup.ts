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
  type PigiSettingsChange,
} from '../../../shared/pigiSettings';

if (typeof window !== 'undefined' && !('piApi' in window)) {
  Object.defineProperty(window, 'piApi', {
    value: {
      readPigiSettings: () => ({ state: PIGI_SETTINGS_READ_STATE.missing }),
      changePigiSettings: (change: PigiSettingsChange): Promise<void> => {
        parsePigiSettings(change);
        return Promise.resolve();
      },
    },
    configurable: true,
    writable: true,
  });
}
