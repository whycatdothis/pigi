/**
 * The single owner of pigi's settings in the main process.
 *
 * Renderers send the slices they changed; the owner merges them and writes
 * immediately. When each renderer debounced and wrote back its whole copy, the
 * last writer won with a stale copy and a quit inside the debounce dropped the
 * change.
 *
 * One writer means no revision and no ordering rule: writes reach the file in
 * the order main received them, and there is nothing to arbitrate.
 */
import {
  parsePigiSettings,
  type PigiSettings,
  type PigiSettingsChange,
} from '../shared/pigiSettings';
import { readPigiSettingsFile, writePigiSettingsFile } from './pigiSettingsFile';

export interface PigiSettingsOwner {
  current(): PigiSettings;
  /** Merge a renderer's change, write it, and return the stored value. */
  applyChange(change: PigiSettingsChange): PigiSettings;
}

export interface PigiSettingsOwnerOptions {
  path: string;
}

export function createPigiSettingsOwner({ path }: PigiSettingsOwnerOptions): PigiSettingsOwner {
  let settings = readPigiSettingsFile(path).settings;

  function applyChange(change: PigiSettingsChange): PigiSettings {
    if (change.appearance === undefined && change.chat === undefined) return settings;
    settings = parsePigiSettings({
      ...settings,
      ...(change.appearance === undefined ? {} : { appearance: change.appearance }),
      ...(change.chat === undefined ? {} : { chat: change.chat }),
    });
    writePigiSettingsFile(path, settings);
    return settings;
  }

  return {
    current: () => settings,
    applyChange,
  };
}
