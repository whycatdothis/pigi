import { mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localFileUrlPath, resolveLocalFile } from './localFile';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pigi-local-file-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function url(path: string): string {
  return `local-file://${encodeURIComponent(path)}`;
}

describe('localFileUrlPath', () => {
  it('decodes the single path segment and ignores the cache-busting query', () => {
    expect(localFileUrlPath(`${url('/a/b c.png')}?v=2`)).toBe('/a/b c.png');
  });

  it('lets the platform decide what is absolute', () => {
    // The renderer appends whatever path it was given: on Windows that is
    // `C:\Users\…`, and a POSIX-only prefix check 404s every image there.
    const drivePath = localFileUrlPath(url('C:\\Users\\me\\shot.png'));
    expect(drivePath === null).toBe(process.platform !== 'win32');
  });

  it('refuses other schemes, relative paths and malformed escapes', () => {
    expect(localFileUrlPath('file:///etc/passwd')).toBeNull();
    expect(localFileUrlPath('local-file://')).toBeNull();
    expect(localFileUrlPath('local-file://relative.png')).toBeNull();
    expect(localFileUrlPath('local-file://%E0%A4%A')).toBeNull();
  });
});

describe('resolveLocalFile', () => {
  it('serves a regular file', async () => {
    const path = join(directory, 'icon.png');
    await writeFile(path, 'png');
    expect(await resolveLocalFile(url(path))).toBe(path);
  });

  it('refuses directories, missing paths and device files', async () => {
    expect(await resolveLocalFile(url(directory))).toBeNull();
    expect(await resolveLocalFile(url(join(directory, 'missing.png')))).toBeNull();
    const device = join(directory, 'zero.png');
    await symlink('/dev/zero', device);
    expect(await resolveLocalFile(url(device))).toBeNull();
  });

  it('refuses a file too large to hand to the image decoder', async () => {
    const path = join(directory, 'huge.png');
    await writeFile(path, '');
    await truncate(path, 64 * 1024 * 1024 + 1);
    expect(await resolveLocalFile(url(path))).toBeNull();
  });
});
