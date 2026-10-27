/**
 * The settings half of the preload bridge.
 *
 * `settings.json` belongs to the main process, and the renderer is its client:
 * `readPigiSettings` is the synchronous first-paint read and
 * `changePigiSettings` sends the slices a commit touched. This fake plays the
 * owner: it merges each change onto its copy and resolves, so a test can see
 * what reached main and what main would hold afterwards.
 */
import {
  DEFAULT_PIGI_SETTINGS,
  PIGI_SETTINGS_READ_STATE,
  parsePigiSettings,
  type PigiSettings,
  type PigiSettingsChange,
} from '../../../shared/pigiSettings';

export interface PigiSettingsBridge {
  /** Every change the store asked the owner to apply, in order. */
  changes: PigiSettingsChange[];
  /** What the fake owner holds after those changes. */
  current: () => PigiSettings;
}

/** Replaces the bridge. Call before the store is used; nothing is reloaded. */
export function installPigiSettingsBridge(initial: unknown = null): PigiSettingsBridge {
  const changes: PigiSettingsChange[] = [];
  let current = initial === null ? DEFAULT_PIGI_SETTINGS : parsePigiSettings(initial);
  window.piApi.readPigiSettings = () =>
    initial === null
      ? { state: PIGI_SETTINGS_READ_STATE.missing }
      : { state: PIGI_SETTINGS_READ_STATE.ok, settings: initial };
  window.piApi.changePigiSettings = (change: PigiSettingsChange): Promise<void> => {
    changes.push(change);
    current = parsePigiSettings({
      ...current,
      ...(change.appearance === undefined ? {} : { appearance: change.appearance }),
      ...(change.chat === undefined ? {} : { chat: change.chat }),
    });
    return Promise.resolve();
  };
  return {
    changes,
    current: () => current,
  };
}
