/**
 * Turn chat attachments into prompt text and provider image content.
 *
 * - Images: read from disk (or decode clipboard base64) and resized to the
 *   provider's inline limits with the SDK's own resizer.
 * - Files: referenced by absolute path under `[Attached files]`; the agent
 *   reads them with its tools. Clipboard files without a path are inlined.
 */
import { readFile, stat } from 'node:fs/promises';
import type { ImageContent } from '@earendil-works/pi-ai/compat';
import { resizeImage } from '@earendil-works/pi-coding-agent';
import type { PromptAttachment } from '../../shared/ipcContract';
import {
  buildAttachedFilesBlock,
  buildAttachmentSummary,
  displayFileName,
} from '../../shared/chatAttachments';

/** Clipboard files larger than this are not inlined into the prompt. */
const MAX_INLINE_FILE_BYTES = 256 * 1024;

export interface BuiltPromptContent {
  text: string;
  images: ImageContent[];
}

export function hasPromptContent(message: string, attachments: PromptAttachment[]): boolean {
  return message.trim().length > 0 || attachments.length > 0;
}

async function readAttachmentBytes(attachment: PromptAttachment): Promise<Buffer> {
  if (attachment.data) {
    return Buffer.from(attachment.data, 'base64');
  }
  if (!attachment.path) {
    throw new Error('attachment has neither path nor data');
  }
  return readFile(attachment.path);
}

async function buildImageContent(attachment: PromptAttachment): Promise<ImageContent> {
  const bytes = await readAttachmentBytes(attachment);
  const resized = await resizeImage(bytes, attachment.mimeType);
  return {
    type: 'image',
    data: resized?.data ?? bytes.toString('base64'),
    mimeType: resized?.mimeType ?? attachment.mimeType,
  };
}

/** Inline a clipboard file that has no path on disk. */
async function buildInlineFileSection(attachment: PromptAttachment): Promise<string> {
  const name = attachment.name;
  const bytes = await readAttachmentBytes(attachment);
  if (bytes.byteLength > MAX_INLINE_FILE_BYTES) {
    return `<file name="${name}">File too large to include (${bytes.byteLength} bytes).</file>`;
  }
  if (bytes.includes(0)) {
    return `<file name="${name}">Binary file (${bytes.byteLength} bytes).</file>`;
  }
  return `<file name="${name}">\n${bytes.toString('utf-8')}\n</file>`;
}

/** Build the text and images for a prompt command. */
export async function buildPromptContent(
  message: string,
  attachments: PromptAttachment[],
): Promise<BuiltPromptContent> {
  const images: ImageContent[] = [];
  const filePaths: string[] = [];
  const inlineSections: string[] = [];

  for (const attachment of attachments) {
    try {
      if (attachment.kind === 'image') {
        images.push(await buildImageContent(attachment));
        continue;
      }
      if (attachment.path) {
        try {
          await stat(attachment.path);
          filePaths.push(attachment.path);
        } catch {
          inlineSections.push(
            `<file name="${displayFileName(attachment.path)}">File not found: ${attachment.path}</file>`,
          );
        }
        continue;
      }
      inlineSections.push(await buildInlineFileSection(attachment));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      inlineSections.push(
        `<file name="${displayFileName(attachment.path ?? attachment.name)}">Failed to attach: ${reason}</file>`,
      );
    }
  }

  const parts = [message.trim()];
  if (message.trim().length === 0 && attachments.length > 0) {
    const imageCount = attachments.filter((attachment) => attachment.kind === 'image').length;
    parts.push(buildAttachmentSummary(imageCount, attachments.length - imageCount));
  }
  parts.push(...inlineSections);
  const filesBlock = buildAttachedFilesBlock(filePaths);
  if (filesBlock) parts.push(filesBlock);

  return { text: parts.filter((part) => part.length > 0).join('\n\n'), images };
}
