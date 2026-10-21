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
  MAX_INLINE_FILE_BYTES,
} from '../../shared/chatAttachments';

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
  // Null means it could not be decoded or brought under the provider's inline
  // limit; the original bytes would fail the whole prompt, so leave it out.
  if (!resized) {
    throw new Error('image could not be resized below the inline image size limit');
  }
  return { type: 'image', data: resized.data, mimeType: resized.mimeType };
}

/** A `<file>` block. The name must stay quote-free for the display sanitizer to match it. */
function fileSection(name: string, body: string): string {
  return `<file name="${name.replaceAll('"', "'")}">${body}</file>`;
}

/** Inline a clipboard file that has no path on disk. */
async function buildInlineFileSection(attachment: PromptAttachment): Promise<string> {
  const name = attachment.name;
  const bytes = await readAttachmentBytes(attachment);
  if (bytes.byteLength > MAX_INLINE_FILE_BYTES) {
    return fileSection(name, `File too large to include (${bytes.byteLength} bytes).`);
  }
  if (bytes.includes(0)) {
    return fileSection(name, `Binary file (${bytes.byteLength} bytes).`);
  }
  return fileSection(name, `\n${bytes.toString('utf-8')}\n`);
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
            fileSection(displayFileName(attachment.path), `File not found: ${attachment.path}`),
          );
        }
        continue;
      }
      inlineSections.push(await buildInlineFileSection(attachment));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      inlineSections.push(
        fileSection(
          displayFileName(attachment.path ?? attachment.name),
          `Failed to attach: ${reason}`,
        ),
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
