import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PIGI_SETTINGS_FILE_NAME,
  readPigiSettingsFile,
  windowBackgroundFor,
  writePigiSettingsFile,
} from './pigiSettingsFile';
import { DEFAULT_PIGI_SETTINGS, type PigiSettings } from '../shared/pigiSettings';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'pigi-settings-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function settingsWithAccent(presetId: string): PigiSettings {
  return {
    version: 2,
    appearance: {
      ...DEFAULT_PIGI_SETTINGS.appearance,
      light: { ...DEFAULT_PIGI_SETTINGS.appearance.light, accent: { presetId } },
    },
    chat: DEFAULT_PIGI_SETTINGS.chat,
  };
}

describe('readPigiSettingsFile', () => {
  it('reports a missing file instead of failing', () => {
    const result = readPigiSettingsFile(join(directory, PIGI_SETTINGS_FILE_NAME));
    expect(result.exists).toBe(false);
    expect(result.settings).toEqual(DEFAULT_PIGI_SETTINGS);
  });

  it('falls back to defaults on a corrupt file and keeps it replaceable', () => {
    const path = join(directory, PIGI_SETTINGS_FILE_NAME);
    writeFileSync(path, '{ not json', 'utf8');

    expect(readPigiSettingsFile(path).settings).toEqual(DEFAULT_PIGI_SETTINGS);
    // The next write must be able to recover the file, not choke on it.
    writePigiSettingsFile(path, settingsWithAccent('teal'));
    expect(readPigiSettingsFile(path).settings.appearance.light.accent).toEqual({
      presetId: 'teal',
    });
  });

  it('migrates an older stored version on read', () => {
    const path = join(directory, PIGI_SETTINGS_FILE_NAME);
    writeFileSync(path, JSON.stringify({ theme: 'dark', accentId: 'rose' }), 'utf8');

    const { settings, exists } = readPigiSettingsFile(path);
    expect(exists).toBe(true);
    expect(settings.version).toBe(2);
    expect(settings.appearance.mode).toBe('dark');
    expect(settings.appearance.light.accent).toEqual({ presetId: 'rose' });
  });
});

describe('writePigiSettingsFile', () => {
  it('round-trips and leaves no temporary file behind', () => {
    const path = join(directory, PIGI_SETTINGS_FILE_NAME);
    writePigiSettingsFile(path, settingsWithAccent('violet'));

    expect(readPigiSettingsFile(path).settings.appearance.light.accent).toEqual({
      presetId: 'violet',
    });
    expect(readdirSync(directory)).toEqual([PIGI_SETTINGS_FILE_NAME]);
  });

  it('creates the directory, so a fresh install can save', () => {
    const path = join(directory, 'nested', PIGI_SETTINGS_FILE_NAME);
    writePigiSettingsFile(path, DEFAULT_PIGI_SETTINGS);
    expect(readPigiSettingsFile(path).exists).toBe(true);
  });

  it('writes human-readable json', () => {
    const path = join(directory, PIGI_SETTINGS_FILE_NAME);
    writePigiSettingsFile(path, settingsWithAccent('amber'));
    const raw = readFileSync(path, 'utf8');
    expect(raw).toContain('\n  "version": 2');
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('windowBackgroundFor', () => {
  it('returns the resolved background as a hex colour the window can paint', () => {
    const light = windowBackgroundFor(settingsWithAccent('blue'), false);
    const dark = windowBackgroundFor(settingsWithAccent('blue'), true);
    expect(light).toMatch(/^#[0-9a-f]{6}$/);
    expect(dark).toMatch(/^#[0-9a-f]{6}$/);
    expect(light).not.toBe(dark);
  });
});
