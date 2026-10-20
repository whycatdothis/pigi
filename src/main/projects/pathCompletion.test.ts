import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completePath, parsePathPrefix } from './pathCompletion';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'pigi-path-'));
  await mkdir(join(root, 'src/components'), { recursive: true });
  await mkdir(join(root, 'src/compose'), { recursive: true });
  await writeFile(join(root, 'src/compose.ts'), '');
  await writeFile(join(root, 'src/.env'), '');
  await writeFile(join(root, 'README.md'), '');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('parsePathPrefix', () => {
  it('splits a relative token at the last slash', () => {
    expect(parsePathPrefix(root, 'src/com')).toEqual({
      directory: join(root, 'src'),
      namePrefix: 'com',
    });
  });

  it('treats a trailing slash as an empty name prefix', () => {
    expect(parsePathPrefix(root, 'src/')).toEqual({
      directory: join(root, 'src'),
      namePrefix: '',
    });
  });

  it('resolves parent segments against the project directory', () => {
    expect(parsePathPrefix(root, '../other/file')).toEqual({
      directory: join(root, '..', 'other'),
      namePrefix: 'file',
    });
  });
});

describe('completePath', () => {
  it('lists directories before files and hides dotfiles by default', async () => {
    const result = await completePath(root, 'src/');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.entries.map((entry) => entry.name)).toEqual([
      'components',
      'compose',
      'compose.ts',
    ]);
    expect(result.entries[0]).toMatchObject({
      isDirectory: true,
      path: join(root, 'src/components'),
    });
  });

  it('fuzzy-matches the name prefix', async () => {
    const result = await completePath(root, 'src/cmp');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.entries.map((entry) => entry.name)).toContain('components');
  });

  it('shows dotfiles once the prefix starts with a dot', async () => {
    const result = await completePath(root, 'src/.');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.entries.map((entry) => entry.name)).toContain('.env');
  });

  it('accepts an absolute token', async () => {
    const result = await completePath('/tmp', `${root}/src/com`);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.entries.map((entry) => entry.name)).toContain('compose.ts');
  });

  it('returns an empty list for a directory that does not exist', async () => {
    const result = await completePath(root, 'missing/x');
    expect(result).toEqual({ success: true, entries: [] });
  });
});
