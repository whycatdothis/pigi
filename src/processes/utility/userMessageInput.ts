/**
 * Rebuild what the user put in the input box from a sent user message, so a
 * message taken back into the input box (edit, tree) keeps its attachments.
 *
 * The prompt text carries the attachment plumbing `promptAttachments` added:
 * the `[Attached files]` paths, inline `<file>` blocks for clipboard files, and
 * the summary marker of an attachment-only message. Images are content parts.
 */
import type { UserMessage } from '@earendil-works/pi-ai';
import type { PromptAttachment, PromptInput } from '../../shared/ipcContract';
import {
  displayFileName,
  FILE_MIME_TYPE,
  splitAttachedFilesBlock,
  splitInlineFileBlocks,
  stripAttachmentSummary,
} from '../../shared/chatAttachments';

export interface RestoredUserInput {
  input: PromptInput;
  /** Files sent as a status line only (binary, too large, missing): nothing to restore. */
  droppedFileNames: string[];
}

export function promptInputFromUserMessage(content: UserMessage['content']): RestoredUserInput {
  const parts = typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content;
  // Joined like the SDK's own editor text.
  const text = parts.map((part) => (part.type === 'text' ? part.text : '')).join('');

  const attachments: PromptAttachment[] = [];
  const droppedFileNames: string[] = [];

  let imageIndex = 0;
  for (const part of parts) {
    if (part.type !== 'image') continue;
    imageIndex += 1;
    const extension = part.mimeType.split('/')[1] ?? 'png';
    attachments.push({
      kind: 'image',
      name: `image-${imageIndex}.${extension}`,
      mimeType: part.mimeType,
      data: part.data,
    });
  }

  const inline = splitInlineFileBlocks(stripAttachmentSummary(text));
  for (const file of inline.files) {
    if (file.content === null) {
      droppedFileNames.push(file.name);
      continue;
    }
    attachments.push({
      kind: 'file',
      name: file.name,
      mimeType: 'text/plain',
      data: Buffer.from(file.content, 'utf-8').toString('base64'),
    });
  }

  const split = splitAttachedFilesBlock(inline.text);
  for (const path of split.filePaths) {
    attachments.push({ kind: 'file', name: displayFileName(path), mimeType: FILE_MIME_TYPE, path });
  }

  return { input: { message: split.text.trim(), attachments }, droppedFileNames };
}
