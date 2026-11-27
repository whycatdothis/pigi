import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalizePathCase } from './pathCase';

const roots: string[] = [];

/** tmpdir is a symlink on macOS; resolve it so expectations match realpath. */
async function tempRoot(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'pathCase-')));
  roots.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('canonicalizePathCase', () => {
  it('returns the disk spelling of a differently-cased path', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'WorkNotes'));
    const typed = join(root, 'worknotes');
    if (!existsSync(typed)) {
      // Case-sensitive volume: the variant does not resolve, input comes back.
      await expect(canonicalizePathCase(typed)).resolves.toBe(typed);
      return;
    }
    await expect(canonicalizePathCase(typed)).resolves.toBe(join(root, 'WorkNotes'));
  });

  it('keeps an exact-case path unchanged', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'WorkNotes'));
    const exact = join(root, 'WorkNotes');
    await expect(canonicalizePathCase(exact)).resolves.toBe(exact);
  });

  it('canonicalizes existing parents but keeps missing components as typed', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'WorkNotes'));
    const typed = join(root, 'worknotes', 'drafts', 'a.jsonl');
    if (!existsSync(join(root, 'worknotes'))) {
      await expect(canonicalizePathCase(typed)).resolves.toBe(typed);
      return;
    }
    await expect(canonicalizePathCase(typed)).resolves.toBe(
      join(root, 'WorkNotes', 'drafts', 'a.jsonl'),
    );
  });
});
