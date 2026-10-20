import { describe, expect, it } from 'vitest';
import {
  buildAttachedFilesBlock,
  buildAttachmentSummary,
  displayFileName,
  imageMimeTypeForPath,
  isSupportedImageMimeType,
  sanitizeUserPromptForDisplay,
  splitAttachedFilesBlock,
  splitInlineFileBlocks,
  stripAttachmentSummary,
  stripInlineFileBlocks,
} from './chatAttachments';

describe('chatAttachments', () => {
  it('round-trips the attached files block', () => {
    const text = `hello\n\n${buildAttachedFilesBlock(['/a/b.ts', '/a/c.png'])}`;
    expect(splitAttachedFilesBlock(text)).toEqual({
      text: 'hello',
      filePaths: ['/a/b.ts', '/a/c.png'],
    });
  });

  it('parses a block-only prompt', () => {
    expect(splitAttachedFilesBlock(buildAttachedFilesBlock(['/a/b.ts']))).toEqual({
      text: '',
      filePaths: ['/a/b.ts'],
    });
  });

  it('leaves text without a block untouched', () => {
    expect(splitAttachedFilesBlock('just a question')).toEqual({
      text: 'just a question',
      filePaths: [],
    });
  });

  it('strips inline file blocks', () => {
    expect(stripInlineFileBlocks('hi\n<file name="x.txt">\nbody\n</file>\n')).toBe('hi');
    expect(stripInlineFileBlocks('hi\n<file name="x.txt">Binary file (12 bytes).</file>\n')).toBe(
      'hi',
    );
  });

  it('returns inline file names for display chips', () => {
    expect(splitInlineFileBlocks('hi\n<file name="notes.txt">\nbody\n</file>\n')).toEqual({
      text: 'hi',
      fileNames: ['notes.txt'],
    });
    expect(sanitizeUserPromptForDisplay('<file name="a.bin">\nraw\n</file>')).toEqual({
      text: '',
      filePaths: [],
      inlineFileNames: ['a.bin'],
    });
  });

  it('leaves user-typed attachment markup alone', () => {
    expect(stripInlineFileBlocks('hi\n<file name="x.txt">inline</file>')).toBe(
      'hi\n<file name="x.txt">inline</file>',
    );
    expect(stripAttachmentSummary('[Attached to the wall] keep me')).toBe(
      '[Attached to the wall] keep me',
    );
  });

  it('detects supported image extensions and mime types', () => {
    expect(imageMimeTypeForPath('/tmp/a.PNG')).toBe('image/png');
    expect(imageMimeTypeForPath('/tmp/a.jpeg')).toBe('image/jpeg');
    expect(imageMimeTypeForPath('/tmp/a.txt')).toBeNull();
    expect(isSupportedImageMimeType('image/webp; charset=binary')).toBe(true);
    expect(isSupportedImageMimeType('image/bmp')).toBe(false);
  });

  it('extracts the display name', () => {
    expect(displayFileName('/a/b/c.ts')).toBe('c.ts');
    expect(displayFileName('C:\\a\\b.ts')).toBe('b.ts');
  });

  it('builds and strips the attachment-only summary', () => {
    expect(buildAttachmentSummary(1, 0)).toBe('[Attached 1 image]');
    expect(buildAttachmentSummary(2, 3)).toBe('[Attached 2 images, 3 files]');
    expect(stripAttachmentSummary('[Attached 2 images]\nwhat is this?')).toBe('what is this?');
    expect(stripAttachmentSummary('what is this?')).toBe('what is this?');
  });

  it('sanitizes prompt plumbing for display', () => {
    const text = `[Attached 1 image]\n\n${buildAttachedFilesBlock(['/a/b.ts'])}`;
    expect(sanitizeUserPromptForDisplay(text)).toEqual({
      text: '',
      filePaths: ['/a/b.ts'],
      inlineFileNames: [],
    });
  });
});
