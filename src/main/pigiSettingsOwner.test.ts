/**
 * The owner is the only writer: it merges a renderer's change onto its copy and
 * writes it before it returns. What matters here is that a change never loses
 * the slice it did not carry, and that the file is written when the call ends.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPigiSettingsOwner } from './pigiSettingsOwner';
import { PIGI_SETTINGS_FILE_NAME, readPigiSettingsFile } from './pigiSettingsFile';
import { DEFAULT_PIGI_SETTINGS } from '../shared/pigiSettings';

let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'pigi-settings-owner-'));
  path = join(directory, PIGI_SETTINGS_FILE_NAME);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('pigi settings owner', () => {
  it('merges a change onto its copy', () => {
    const owner = createPigiSettingsOwner({ path });

    const merged = owner.applyChange({
      chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' },
    });

    expect(merged.chat.toolBlockViewMode).toBe('minimal');
    expect(owner.current()).toEqual(merged);
  });

  it('keeps the slice a change does not carry', () => {
    const owner = createPigiSettingsOwner({ path });

    owner.applyChange({ chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' } });
    const merged = owner.applyChange({
      appearance: { ...DEFAULT_PIGI_SETTINGS.appearance, mode: 'dark' },
    });

    // The second change carries only the appearance: the chat slice it never
    // saw is still applied.
    expect(merged.appearance.mode).toBe('dark');
    expect(merged.chat.toolBlockViewMode).toBe('minimal');
  });

  it('writes the file before applyChange returns', () => {
    const owner = createPigiSettingsOwner({ path });

    owner.applyChange({ appearance: { ...DEFAULT_PIGI_SETTINGS.appearance, mode: 'light' } });

    // No timer to wait for: the write is part of the call.
    expect(readPigiSettingsFile(path).settings.appearance.mode).toBe('light');
  });

  it('does not create the file for a change that carries no slice', () => {
    const owner = createPigiSettingsOwner({ path });

    // `parsePigiSettingsChange` turns a malformed payload into `{}`; merging it
    // would write the same bytes back, which is only noise on disk.
    owner.applyChange({});

    expect(existsSync(path)).toBe(false);
  });

  it('keeps the file human-readable', () => {
    const owner = createPigiSettingsOwner({ path });
    owner.applyChange({ chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' } });
    expect(readFileSync(path, 'utf8')).toContain('\n  "version": 2');
  });

  it('starts from what is on disk', () => {
    const first = createPigiSettingsOwner({ path });
    first.applyChange({ chat: { ...DEFAULT_PIGI_SETTINGS.chat, toolBlockViewMode: 'minimal' } });

    const second = createPigiSettingsOwner({ path });
    expect(second.current().chat.toolBlockViewMode).toBe('minimal');
  });
});
