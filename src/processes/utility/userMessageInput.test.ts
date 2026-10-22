import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPromptContent } from './promptAttachments';
import { promptInputFromUserMessage } from './userMessageInput';

// 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let directory = '';

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pigi-user-input-'));
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('promptInputFromUserMessage', () => {
  it('gives back the text and every attachment a sent prompt carried', async () => {
    const filePath = join(directory, 'notes.ts');
    await writeFile(filePath, 'const answer = 42;\n', 'utf-8');
    const clipboardText = 'pasted line one\npasted line two';

    const built = await buildPromptContent('review this', [
      { kind: 'image', name: 'shot.png', mimeType: 'image/png', data: PNG_BASE64 },
      { kind: 'file', name: 'notes.ts', mimeType: 'text/plain', path: filePath },
      {
        kind: 'file',
        name: 'clip.txt',
        mimeType: 'text/plain',
        data: Buffer.from(clipboardText).toString('base64'),
      },
    ]);
    const restored = promptInputFromUserMessage([
      { type: 'text', text: built.text },
      ...built.images,
    ]);

    expect(restored.droppedFileNames).toEqual([]);
    expect(restored.input.message).toBe('review this');
    expect(restored.input.attachments).toEqual([
      expect.objectContaining({ kind: 'image', mimeType: built.images[0].mimeType }),
      expect.objectContaining({
        kind: 'file',
        name: 'clip.txt',
        data: Buffer.from(clipboardText).toString('base64'),
      }),
      expect.objectContaining({ kind: 'file', name: 'notes.ts', path: filePath }),
    ]);
  });

  it('drops the summary marker of an attachment-only message', async () => {
    const built = await buildPromptContent('', [
      { kind: 'image', name: 'shot.png', mimeType: 'image/png', data: PNG_BASE64 },
    ]);
    const restored = promptInputFromUserMessage([
      { type: 'text', text: built.text },
      ...built.images,
    ]);

    expect(restored.input.message).toBe('');
    expect(restored.input.attachments).toHaveLength(1);
  });

  it('reports files that were sent as a status line only', () => {
    const restored = promptInputFromUserMessage(
      'hi\n\n<file name="blob.bin">Binary file (12 bytes).</file>',
    );

    expect(restored.input).toEqual({ message: 'hi', attachments: [] });
    expect(restored.droppedFileNames).toEqual(['blob.bin']);
  });
});
