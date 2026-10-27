/**
 * The owner is the only writer: it merges renderers' changes, bumps the
 * revision, notifies every window, and writes on a debounce that `flush` can
 * force. What matters here is that no sequence of changes loses one, and that
 * the revision never goes backwards on disk.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPigiSettingsOwner } from './pigiSettingsOwner';
import {
  PIGI_SETTINGS_FILE_NAME,
  readPigiSettingsFile,
  writePigiSettingsFile,
} from './pigiSettingsFile';
import { DEFAULT_PIGI_SETTINGS, type PigiSettings } from '../shared/pigiSettings';

let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'pigi-settings-owner-'));
  path = join(directory, PIGI_SETTINGS_FILE_NAME);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});

function ownerWithSpy(): {
  owner: ReturnType<typeof createPigiSettingsOwner>;
  snapshots: PigiSettings[];
} {
  const snapshots: PigiSettings[] = [];
  const owner = createPigiSettingsOwner({
    path,
    onChanged: (settings) => snapshots.push(settings),
  });
  return { owner, snapshots };
}

describe('pigi settings owner', () => {
  it('merges a change onto its copy and bumps the revision', () => {
    const { owner, snapshots } = ownerWithSpy();

    const merged = owner.applyChange({
      chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' },
    });

    expect(merged.chat.toolBlockViewMode).toBe('minimal');
    expect(merged.revision).toBe(1);
    expect(owner.current()).toBe(merged);
    // Every window hears about it in the same turn.
    expect(snapshots).toEqual([merged]);
  });

  it('does not lose either window when two slices change in a row', () => {
    const { owner } = ownerWithSpy();

    owner.applyChange({
      chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' },
    });
    const merged = owner.applyChange({
      appearance: { ...DEFAULT_PIGI_SETTINGS.appearance, mode: 'dark' },
    });

    // The second change carries only the appearance: the chat slice it never
    // saw is still applied.
    expect(merged.appearance.mode).toBe('dark');
    expect(merged.chat.toolBlockViewMode).toBe('minimal');
    expect(merged.revision).toBe(2);
  });

  it('debounces the file write and flushes the last change once', () => {
    const { owner } = ownerWithSpy();

    owner.applyChange({ chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'default' } });
    owner.applyChange({
      chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' },
    });
    // Still in memory only.
    expect(readPigiSettingsFile(path).exists).toBe(false);

    vi.advanceTimersByTime(150);

    const onDisk = readPigiSettingsFile(path).settings;
    expect(onDisk.chat.toolBlockViewMode).toBe('minimal');
    expect(onDisk.revision).toBe(2);
  });

  it('writes synchronously on flush, before the debounce fires', () => {
    const { owner } = ownerWithSpy();
    owner.applyChange({
      appearance: { ...DEFAULT_PIGI_SETTINGS.appearance, mode: 'light' },
    });

    owner.flush();

    expect(readPigiSettingsFile(path).settings.appearance.mode).toBe('light');
    expect(readPigiSettingsFile(path).settings.revision).toBe(1);
    // Nothing is queued twice: the pending timer is gone.
    vi.advanceTimersByTime(500);
    expect(readPigiSettingsFile(path).settings.revision).toBe(1);
  });

  it('keeps the file human-readable', () => {
    const { owner } = ownerWithSpy();
    owner.applyChange({ chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' } });
    owner.flush();
    expect(readFileSync(path, 'utf8')).toContain('\n  "revision": 1');
  });

  it('adopts a revision the file forced higher, and tells the windows', () => {
    const { owner, snapshots } = ownerWithSpy();
    // Another app instance wrote revision 9 after this owner read its copy.
    expect(owner.current().revision).toBe(0);
    writePigiSettingsFile(path, { ...DEFAULT_PIGI_SETTINGS, revision: 9 });

    owner.applyChange({ chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' } });
    owner.flush();

    const onDisk = readPigiSettingsFile(path).settings;
    expect(onDisk.revision).toBe(10);
    // The owner noticed and re-broadcast the revision it actually stored.
    expect(owner.current().revision).toBe(10);
    expect(snapshots.at(-1)?.revision).toBe(10);
  });
});
