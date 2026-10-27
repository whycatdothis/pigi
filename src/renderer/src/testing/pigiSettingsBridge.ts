/**
 * The settings half of the preload bridge.
 *
 * `settings.json` belongs to the main process, and the renderer is its client:
 * `readPigiSettings` is the synchronous first-paint read, `changePigiSettings`
 * sends the slices a commit touched, and `onPigiSettingsChanged` delivers the
 * merged snapshot. This fake plays the owner: it merges each change onto its
 * copy, bumps the revision and resolves with (and broadcasts) the result, so a
 * test sees the same two paths the app does.
 */
import {
  DEFAULT_PIGI_SETTINGS,
  PIGI_SETTINGS_READ_STATE,
  parsePigiSettings,
  type PigiSettings,
  type PigiSettingsChange,
} from '../../../shared/pigiSettings';
import { emitPigiSettingsSnapshot } from './preloadBridgeSetup';

export interface PigiSettingsBridge {
  /** Every change the store asked the owner to apply, in order. */
  changes: PigiSettingsChange[];
  /** The fake owner's current snapshot, including its revision. */
  current: () => PigiSettings;
  /** Push a snapshot as if the owner or the other window changed it. */
  broadcast: (settings: PigiSettings) => void;
}

/** Replaces the bridge. Call before the store is used; nothing is reloaded. */
export function installPigiSettingsBridge(initial: unknown = null): PigiSettingsBridge {
  const changes: PigiSettingsChange[] = [];
  let current = initial === null ? DEFAULT_PIGI_SETTINGS : parsePigiSettings(initial);
  window.piApi.readPigiSettings = () =>
    initial === null
      ? { state: PIGI_SETTINGS_READ_STATE.missing }
      : { state: PIGI_SETTINGS_READ_STATE.ok, settings: initial };
  window.piApi.changePigiSettings = (change: PigiSettingsChange): Promise<PigiSettings> => {
    changes.push(change);
    current = parsePigiSettings({
      ...current,
      ...(change.appearance === undefined ? {} : { appearance: change.appearance }),
      ...(change.chat === undefined ? {} : { chat: change.chat }),
      revision: current.revision + 1,
    });
    emitPigiSettingsSnapshot(current);
    return Promise.resolve(current);
  };
  return {
    changes,
    current: () => current,
    broadcast: (settings) => {
      current = parsePigiSettings(settings);
      emitPigiSettingsSnapshot(current);
    },
  };
}
