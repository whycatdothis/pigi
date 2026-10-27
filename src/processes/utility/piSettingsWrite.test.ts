import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePiSettingsDocument } from './piSettingsWrite';

const directories: string[] = [];

function settingsFile(content?: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'pigi-pi-settings-'));
  directories.push(directory);
  const path = join(directory, 'settings.json');
  if (content !== undefined) {
    writeFileSync(path, content, 'utf-8');
  }
  return path;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('writePiSettingsDocument', () => {
  it('creates the file and its directory for the first write', async () => {
    const path = settingsFile();

    await writePiSettingsDocument(path, [{ field: 'compaction.reserveTokens', value: 16384 }]);

    expect(readJson(path)).toEqual({ compaction: { reserveTokens: 16384 } });
  });

  it('leaves keys this app does not know about untouched', async () => {
    const path = settingsFile(
      JSON.stringify({ theme: 'dark', extensions: ['a.ts'], compaction: { reserveTokens: 1 } }),
    );

    await writePiSettingsDocument(path, [{ field: 'compaction.reserveTokens', value: 4096 }]);

    expect(readJson(path)).toEqual({
      theme: 'dark',
      extensions: ['a.ts'],
      compaction: { reserveTokens: 4096 },
    });
  });

  it('clears a field and the parent it leaves empty', async () => {
    const path = settingsFile(JSON.stringify({ compaction: { reserveTokens: 16384 } }));

    await writePiSettingsDocument(path, [{ field: 'compaction.reserveTokens', value: null }]);

    expect(readJson(path)).toEqual({});
  });

  it('writes several fields from one batch', async () => {
    const path = settingsFile();

    await writePiSettingsDocument(path, [
      { field: 'retry.maxRetries', value: 5 },
      { field: 'httpIdleTimeoutMs', value: 60_000 },
    ]);

    expect(readJson(path)).toEqual({ retry: { maxRetries: 5 }, httpIdleTimeoutMs: 60_000 });
  });

  it('serializes two writers instead of losing one of them', async () => {
    const path = settingsFile();

    await Promise.all([
      writePiSettingsDocument(path, [{ field: 'retry.maxRetries', value: 3 }]),
      writePiSettingsDocument(path, [{ field: 'compaction.reserveTokens', value: 2048 }]),
    ]);

    expect(readJson(path)).toEqual({
      retry: { maxRetries: 3 },
      compaction: { reserveTokens: 2048 },
    });
  });

  it('refuses a file that is not a JSON object, and leaves it as it was', async () => {
    const path = settingsFile('{"retry": ');

    await expect(
      writePiSettingsDocument(path, [{ field: 'retry.maxRetries', value: 3 }]),
    ).rejects.toThrow();

    expect(readFileSync(path, 'utf-8')).toBe('{"retry": ');
  });

  it('leaves no temporary file behind', async () => {
    const path = settingsFile();

    await writePiSettingsDocument(path, [{ field: 'retry.maxRetries', value: 3 }]);

    expect(readdirSync(join(path, '..')).sort()).toEqual(['settings.json']);
  });
});
