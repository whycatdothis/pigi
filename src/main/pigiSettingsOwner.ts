/**
 * The single owner of pigi's settings in the main process.
 *
 * The file used to be written by whichever renderer changed a value: each one
 * held the whole document, applied a debounce and wrote it all back, so the
 * last writer won with whatever copy it happened to hold, and a quit inside the
 * debounce dropped the change. Now the main process holds the authoritative
 * copy: renderers send the slices they changed, the owner merges them and
 * writes immediately, and the renderer's own copy is the one it just applied.
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
  /** The authoritative value. */
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
