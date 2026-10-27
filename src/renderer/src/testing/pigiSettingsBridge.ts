/**
 * The settings half of the preload bridge.
 *
 * `settings.json` lives in the main process, so a component test sees it through
 * these two functions: `readPigiSettings` is what the store loads at module init,
 * `writePigiSettings` is where every commit ends up. Writes are recorded
 * synchronously, before the returned promise resolves, so a test can assert on
 * the file contents without waiting a tick.
 */
import {
  PIGI_SETTINGS_READ_STATE,
  parsePigiSettings,
  type PigiSettings,
} from '../../../shared/pigiSettings';

export interface PigiSettingsBridge {
  /** Every value the store asked to persist, in order. */
  writes: PigiSettings[];
}

/** Replaces the bridge. Call before the store is used; nothing is reloaded. */
export function installPigiSettingsBridge(initial: unknown = null): PigiSettingsBridge {
  const writes: PigiSettings[] = [];
  window.piApi.readPigiSettings = () =>
    initial === null
      ? { state: PIGI_SETTINGS_READ_STATE.missing }
      : { state: PIGI_SETTINGS_READ_STATE.ok, settings: initial };
  window.piApi.writePigiSettings = (value: unknown): Promise<boolean> => {
    writes.push(parsePigiSettings(value));
    return Promise.resolve(true);
  };
  return { writes };
}
