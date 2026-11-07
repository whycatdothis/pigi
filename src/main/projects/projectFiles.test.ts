import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listProjectDirectory, readProjectFile, resolveExistingPaths } from './projectFiles';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
let root: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'pigi-files-'));
  outside = await mkdtemp(join(tmpdir(), 'pigi-files-outside-'));
  await mkdir(join(root, 'src/components'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await mkdir(join(root, 'target'), { recursive: true });
  await writeFile(join(root, '.env'), 'TOKEN=1\n');
  await writeFile(join(root, 'README.md'), '# Readme\n');
  await writeFile(join(root, 'src/app.ts'), 'export const app = 1;\n');
  await writeFile(join(root, 'target/inside.ts'), 'inside\n');
  await writeFile(join(root, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
  await writeFile(join(root, 'large.txt'), 'x'.repeat(MAX_FILE_BYTES + 1));
  await writeFile(join(outside, 'secret.txt'), 'secret\n');
  await symlink(join(root, 'target'), join(root, 'linked'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('listProjectDirectory', () => {
  it('lists directories first with relative paths and hides .git', async () => {
    const result = await listProjectDirectory(root, '');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.truncated).toBe(false);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'linked',
      'src',
      'target',
      '.env',
      'binary.bin',
      'large.txt',
      'README.md',
    ]);
    expect(result.entries[0]).toMatchObject({ isDirectory: true });
  });

  it('resolves symlinked directories as directories', async () => {
    const result = await listProjectDirectory(root, '');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.entries.find((entry) => entry.name === 'linked')?.isDirectory).toBe(true);
  });

  it('reads child directories by project-relative path', async () => {
    const result = await listProjectDirectory(root, 'src');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.entries.map((entry) => entry.path)).toEqual(['src/components', 'src/app.ts']);
  });

  it('refuses paths outside the project', async () => {
    await expect(listProjectDirectory(root, '../')).resolves.toEqual({
      success: false,
      error: 'The path is outside the project.',
    });
    await expect(listProjectDirectory(root, join(outside, 'secret.txt'))).resolves.toEqual({
      success: false,
      error: 'The path is outside the project.',
    });
  });

  it('reports a missing directory as an error', async () => {
    const result = await listProjectDirectory(root, 'missing');
    expect(result.success).toBe(false);
  });
});

describe('readProjectFile', () => {
  it('returns text content and size', async () => {
    await expect(readProjectFile(root, 'src/app.ts')).resolves.toEqual({
      success: true,
      content: 'export const app = 1;\n',
      size: 22,
      truncated: false,
    });
  });

  it('refuses binary files', async () => {
    const result = await readProjectFile(root, 'binary.bin');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('binary');
  });

  it('reports a deleted file clearly', async () => {
    await expect(readProjectFile(root, 'missing.txt')).resolves.toEqual({
      success: false,
      error: 'This file no longer exists.',
    });
  });

  it('refuses directories and relative paths that climb out of the project', async () => {
    await expect(readProjectFile(root, 'src')).resolves.toEqual({
      success: false,
      error: 'This path is not a file.',
    });
    await expect(readProjectFile(root, '../secret.txt')).resolves.toEqual({
      success: false,
      error: 'The path is outside the project.',
    });
  });

  it('reads an absolute path outside the project, which a chat link can name', async () => {
    await expect(readProjectFile(root, join(outside, 'secret.txt'))).resolves.toMatchObject({
      success: true,
      content: 'secret\n',
    });
  });

  it('truncates a file larger than the viewer limit', async () => {
    const result = await readProjectFile(root, 'large.txt');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.truncated).toBe(true);
    expect(result.size).toBe(MAX_FILE_BYTES + 1);
    expect(result.content).toHaveLength(MAX_FILE_BYTES);
  });
});

describe('resolveExistingPaths', () => {
  it('resolves relative and absolute paths to existing files and directories', async () => {
    await expect(
      resolveExistingPaths(root, [
        'src/app.ts',
        './README.md',
        join(outside, 'secret.txt'),
        'src',
        'missing.ts',
        '',
      ]),
    ).resolves.toEqual([
      { path: join(root, 'src/app.ts'), isDirectory: false },
      { path: join(root, 'README.md'), isDirectory: false },
      { path: join(outside, 'secret.txt'), isDirectory: false },
      { path: join(root, 'src'), isDirectory: true },
      null,
      null,
    ]);
  });
});
