/**
 * Renderer-side chat attachments.
 *
 * A `ChatAttachment` keeps display data (preview URL, size) next to the payload
 * that the utility process receives (`PromptAttachment`).
 */
import type {
  ChatAttachmentKind,
  PickedAttachment,
  PromptAttachment,
} from '../../../shared/ipcContract';
import {
  attachmentOnlyTitle,
  displayFileName,
  imageMimeTypeForPath,
  isSupportedImageMimeType,
  MAX_INLINE_FILE_BYTES,
  MAX_PASTED_IMAGE_BYTES,
  MAX_PROMPT_ATTACHMENTS,
} from '../../../shared/chatAttachments';

export { MAX_PROMPT_ATTACHMENTS, displayFileName };

export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  /** Absolute path when the file lives on disk. */
  path?: string;
  /** Base64 bytes for clipboard content without a path. */
  data?: string;
  /** Image preview URL (data: or local-file:). Images only. */
  previewUrl?: string;
}

let attachmentIdCounter = 0;

function nextAttachmentId(): string {
  attachmentIdCounter += 1;
  return `attachment-${attachmentIdCounter}`;
}

/** URL understood by the main-process `local-file` protocol. */
export function localFileUrl(path: string): string {
  return `local-file://${encodeURIComponent(path)}`;
}

function imagePreviewUrl(attachment: { path?: string; data?: string; mimeType: string }): string {
  if (attachment.path) return localFileUrl(attachment.path);
  if (attachment.data) return `data:${attachment.mimeType};base64,${attachment.data}`;
  return '';
}

export function attachmentFromPickedFile(file: PickedAttachment): ChatAttachment {
  return {
    id: nextAttachmentId(),
    kind: file.kind,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    path: file.path,
    previewUrl: file.kind === 'image' ? localFileUrl(file.path) : undefined,
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('unexpected file reader result'));
        return;
      }
      const commaIndex = reader.result.indexOf(',');
      resolve(commaIndex === -1 ? '' : reader.result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Build an attachment from a pasted or dropped browser File. */
export async function attachmentFromFile(file: File, path: string): Promise<ChatAttachment> {
  const byExtensionMimeType = imageMimeTypeForPath(file.name);
  const reportedMimeType = file.type || byExtensionMimeType || 'application/octet-stream';
  const kind: ChatAttachmentKind =
    isSupportedImageMimeType(reportedMimeType) || byExtensionMimeType !== null ? 'image' : 'file';
  const mimeType = byExtensionMimeType ?? reportedMimeType;

  if (path) {
    return {
      id: nextAttachmentId(),
      kind,
      name: file.name || displayFileName(path),
      mimeType,
      size: file.size,
      path,
      previewUrl: kind === 'image' ? imagePreviewUrl({ path, mimeType }) : undefined,
    };
  }

  // Images are resized after transfer, so only inline files need the 256KB
  // cap; check it before reading the whole clipboard payload into base64.
  if (kind === 'file' && file.size > MAX_INLINE_FILE_BYTES) {
    throw new Error(`File is too large to attach (max ${formatFileSize(MAX_INLINE_FILE_BYTES)}).`);
  }
  // Pasted images also have to be readable into memory; refuse absurd ones.
  if (kind === 'image' && file.size > MAX_PASTED_IMAGE_BYTES) {
    throw new Error(
      `Image is too large to attach (max ${formatFileSize(MAX_PASTED_IMAGE_BYTES)}).`,
    );
  }

  const data = await readFileAsBase64(file);
  return {
    id: nextAttachmentId(),
    kind,
    name: file.name,
    mimeType,
    size: file.size,
    data,
    previewUrl: kind === 'image' ? imagePreviewUrl({ data, mimeType }) : undefined,
  };
}

/** Image preview URLs for transcript bubbles. */
export function attachmentImageSources(attachments: ChatAttachment[]): string[] {
  return attachments.flatMap((attachment) =>
    attachment.kind === 'image' && attachment.previewUrl ? [attachment.previewUrl] : [],
  );
}

/** Attached file paths for transcript chips. */
export function attachmentFilePaths(
  attachments: ReadonlyArray<Pick<PromptAttachment, 'kind' | 'path'>> = [],
): string[] {
  return attachments.flatMap((attachment) =>
    attachment.kind === 'file' && attachment.path ? [attachment.path] : [],
  );
}

/** Image preview URLs for attachments restored from a prompt payload. */
export function promptAttachmentImageSources(attachments?: PromptAttachment[]): string[] {
  return (attachments ?? []).flatMap((attachment) =>
    attachment.kind === 'image' && attachment.data
      ? [`data:${attachment.mimeType};base64,${attachment.data}`]
      : [],
  );
}

/** Rebuild a composer attachment from a prompt payload (abort/dequeue restore). */
export function attachmentFromPromptAttachment(attachment: PromptAttachment): ChatAttachment {
  return {
    id: nextAttachmentId(),
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    // Path attachments carry no size; the chip hides a zero size.
    size: attachment.data ? Math.floor((attachment.data.length * 3) / 4) : 0,
    path: attachment.path,
    data: attachment.data,
    previewUrl: attachment.kind === 'image' ? imagePreviewUrl(attachment) : undefined,
  };
}

/** Payload sent to the utility process (drops renderer-only fields). */
export function toPromptAttachments(attachments: ChatAttachment[]): PromptAttachment[] {
  return attachments.map((attachment) => ({
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    path: attachment.path,
    data: attachment.data,
  }));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Title for a message that may consist only of attachments. */
export function chatMessageTitle(message: string, attachments: ChatAttachment[]): string {
  const trimmed = message.trim();
  if (trimmed) return trimmed;
  const fileNames = attachments
    .filter((attachment) => attachment.kind !== 'image')
    .map((attachment) => attachment.name);
  return attachmentOnlyTitle(attachments.length - fileNames.length, fileNames);
}
