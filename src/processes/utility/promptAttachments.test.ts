import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPromptContent } from './promptAttachments';

// 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let directory = '';

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pigi-attachments-'));
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('buildPromptContent', () => {
  it('references file paths instead of inlining them', async () => {
    const filePath = join(directory, 'notes.ts');
    await writeFile(filePath, 'const answer = 42;\n', 'utf-8');

    const content = await buildPromptContent('review this', [
      { kind: 'file', name: 'notes.ts', mimeType: 'text/plain', path: filePath },
    ]);

    expect(content.images).toEqual([]);
    expect(content.text).toContain('review this');
    expect(content.text).toContain(filePath);
    expect(content.text).not.toContain('const answer');
  });

  it('reports missing files without failing the prompt', async () => {
    const content = await buildPromptContent('', [
      {
        kind: 'file',
        name: 'missing.ts',
        mimeType: 'text/plain',
        path: join(directory, 'missing.ts'),
      },
    ]);

    expect(content.text).toContain('File not found');
  });

  it('inlines clipboard files that have no path', async () => {
    const content = await buildPromptContent('', [
      {
        kind: 'file',
        name: 'clipboard.txt',
        mimeType: 'text/plain',
        data: Buffer.from('pasted body', 'utf-8').toString('base64'),
      },
    ]);

    expect(content.text).toContain('<file name="clipboard.txt">');
    expect(content.text).toContain('pasted body');
  });

  it('turns image attachments into provider image content', async () => {
    const content = await buildPromptContent('describe', [
      { kind: 'image', name: 'pixel.png', mimeType: 'image/png', data: PNG_BASE64 },
    ]);

    expect(content.text).toBe('describe');
    expect(content.images).toHaveLength(1);
    expect(content.images[0]?.type).toBe('image');
    expect(content.images[0]?.data.length).toBeGreaterThan(0);
  });

  it('keeps a summary marker when only attachments are sent', async () => {
    const content = await buildPromptContent('', [
      { kind: 'image', name: 'pixel.png', mimeType: 'image/png', data: PNG_BASE64 },
    ]);

    expect(content.text).toBe('[Attached 1 image]');
    expect(content.images).toHaveLength(1);
  });
});
