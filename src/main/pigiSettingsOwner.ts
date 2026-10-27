/**
 * The single owner of pigi's settings in the main process.
 *
 * Three readers used to share this file with no broadcast: main read it before
 * the window existed, the preload read it again for the first paint, and each
 * renderer wrote the whole document through a debounce. The update window loads
 * the same bundle, so it is a second writer, and two writers interleaving lose
 * one of the writes.
 *
 * Now the owner holds the authoritative copy:
 *
 * - Renderers send the slices they changed (`changePigiSettings`), never the
 *   whole file, so two windows editing different slices both land.
 * - The owner merges onto its copy, bumps the revision, notifies every window
 *   (one snapshot, so both windows always agree) and returns it to the sender.
 * - The write is debounced; `flush` writes synchronously on quit, because a
 *   renderer's `pagehide` invoke can lose the race with `before-quit`.
 * - The file's own revision is the last word: if it moved ahead of this
 *   in-memory copy, the write keeps the higher revision (never moves backwards).
 */
import {
  parsePigiSettings,
  type PigiSettings,
  type PigiSettingsChange,
} from '../shared/pigiSettings';
import { readPigiSettingsFile, writePigiSettingsFile } from './pigiSettingsFile';

/** Dragging a contrast slider commits per frame; the file does not need that. */
export const PIGI_SETTINGS_WRITE_DELAY_MS = 150;

export interface PigiSettingsOwner {
  /** The authoritative value, including its revision. */
  current(): PigiSettings;
  /** Merge a renderer's change, notify listeners, and queue the write. */
  applyChange(change: PigiSettingsChange): PigiSettings;
  /** Write the queued value now. Called on quit, after the last change. */
  flush(): void;
}

export interface PigiSettingsOwnerOptions {
  path: string;
  /** Called with the merged snapshot after every change the owner accepts. */
  onChanged: (settings: PigiSettings) => void;
  writeDelayMs?: number;
}

export function createPigiSettingsOwner({
  path,
  onChanged,
  writeDelayMs = PIGI_SETTINGS_WRITE_DELAY_MS,
}: PigiSettingsOwnerOptions): PigiSettingsOwner {
  let settings = readPigiSettingsFile(path).settings;
  let pending: PigiSettings | null = null;
  let writeTimer: NodeJS.Timeout | null = null;

  function writeNow(): void {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    const queued = pending;
    pending = null;
    if (!queued) {
      return;
    }
    // The file may have moved ahead of this copy (a second app instance); the
    // writer keeps the highest revision and returns what it actually stored.
    const written = writePigiSettingsFile(path, queued);
    if (written.revision !== settings.revision) {
      settings = written;
      onChanged(settings);
    }
  }

  function flush(): void {
    writeNow();
  }

  function applyChange(change: PigiSettingsChange): PigiSettings {
    settings = parsePigiSettings({
      ...settings,
      ...(change.appearance === undefined ? {} : { appearance: change.appearance }),
      ...(change.chat === undefined ? {} : { chat: change.chat }),
      revision: settings.revision + 1,
    });
    pending = settings;
    if (writeTimer) {
      clearTimeout(writeTimer);
    }
    writeTimer = setTimeout(writeNow, writeDelayMs);
    onChanged(settings);
    return settings;
  }

  return {
    current: () => settings,
    applyChange,
    flush,
  };
}
