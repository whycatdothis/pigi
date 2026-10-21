/**
 * Chat attachment helpers shared by the utility process and the renderer.
 *
 * Non-image files are referenced by absolute path in the prompt under an
 * `[Attached files]` block; the agent reads them with its tools. Renderer
 * surfaces strip that block from user bubbles and show the paths as chips.
 */

/** Maximum number of attachments accepted for one message. */
export const MAX_PROMPT_ATTACHMENTS = 12;

/** Clipboard files larger than this are not inlined into the prompt. */
export const MAX_INLINE_FILE_BYTES = 256 * 1024;

/** Pasted images larger than this are rejected before they are read into base64. */
export const MAX_PASTED_IMAGE_BYTES = 20 * 1024 * 1024;

/** Marker that introduces the list of attached file paths in a prompt. */
export const ATTACHED_FILES_HEADER = '[Attached files]';

/** Marker used as message text when the user sent attachments without text. */
const ATTACHED_SUMMARY_RE =
  /^\s*\[Attached \d+ (?:images?|files?)(?:, \d+ (?:images?|files?))?\]\s*\n?/;
const SUMMARY_IMAGE_COUNT_RE = /(\d+) images?/;

const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const SUPPORTED_IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

// Matches the shapes promptAttachments generates: an inline text file
// (`\nCONTENT\n`) or one of the generated status lines. Single-line
// user-typed `<file>` markup is left alone; a user-typed block in the
// multi-line shape cannot be told apart and is stripped too. The name is
// captured so the renderer can show a chip for a clipboard file without a path.
const INLINE_FILE_BLOCK_RE =
  /<file name="([^"\n]*)">(?:File too large to include \(\d+ bytes\)\.|Binary file \(\d+ bytes\)\.|File not found: [^\n<]*|Failed to attach: [^\n<]*|\n[\s\S]*?\n)<\/file>\n?/g;

export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

/** True when the agent provider accepts this image MIME type. */
export function isSupportedImageMimeType(mimeType: string): boolean {
  const base = baseMimeType(mimeType);
  return SUPPORTED_IMAGE_MIME_TYPES.includes(base);
}

/** Image MIME type for a path's extension, or null when it is not an image. */
export function imageMimeTypeForPath(path: string): string | null {
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex === -1) return null;
  return SUPPORTED_IMAGE_EXTENSIONS[path.slice(dotIndex + 1).toLowerCase()] ?? null;
}

/** Last path segment, used for compact chip labels. */
export function displayFileName(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/** Build the prompt block that tells the agent which files were attached. */
export function buildAttachedFilesBlock(paths: string[]): string {
  if (paths.length === 0) return '';
  return `${ATTACHED_FILES_HEADER}\n${paths.join('\n')}`;
}

/**
 * Conversation text for an attachment-only message. Without it the SDK records
 * the first user message as empty and session lists render "(no messages)".
 */
export function buildAttachmentSummary(imageCount: number, fileCount: number): string {
  const parts: string[] = [];
  if (imageCount > 0) parts.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`);
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
  return `[Attached ${parts.join(', ')}]`;
}

/** Remove the attachment-only summary marker from display text. */
export function stripAttachmentSummary(text: string): string {
  return text.replace(ATTACHED_SUMMARY_RE, '');
}

/** User-prompt text prepared for display: no attachment plumbing. */
export function sanitizeUserPromptForDisplay(text: string): {
  text: string;
  filePaths: string[];
  inlineFileNames: string[];
} {
  const inline = splitInlineFileBlocks(stripAttachmentSummary(text));
  return { ...splitAttachedFilesBlock(inline.text), inlineFileNames: inline.fileNames };
}

/** Title for an attachment-only message: "Image", "3 images", "notes.md" or "4 files". */
export function attachmentOnlyTitle(imageCount: number, fileNames: string[]): string {
  const total = imageCount + fileNames.length;
  if (total === 0) return '';
  if (fileNames.length === 0) return imageCount === 1 ? 'Image' : `${imageCount} images`;
  if (total === 1) return fileNames[0];
  return `${total} files`;
}

/** Session-list title for a stored prompt, without the attachment plumbing. */
export function promptTitle(text: string): string {
  const split = sanitizeUserPromptForDisplay(text);
  const trimmed = split.text.trim();
  if (trimmed) return trimmed;
  const summary = ATTACHED_SUMMARY_RE.exec(text)?.[0] ?? '';
  const imageCount = Number(SUMMARY_IMAGE_COUNT_RE.exec(summary)?.[1] ?? 0);
  const fileNames = [...split.filePaths.map(displayFileName), ...split.inlineFileNames];
  return attachmentOnlyTitle(imageCount, fileNames);
}

/**
 * Split inline `<file>` blocks out of a prompt. The names are kept so the
 * renderer can show a chip for a clipboard attachment that has no path.
 */
export function splitInlineFileBlocks(text: string): { text: string; fileNames: string[] } {
  const fileNames: string[] = [];
  const stripped = text.replace(INLINE_FILE_BLOCK_RE, (_match, name: string) => {
    fileNames.push(name);
    return '';
  });
  return { text: stripped.trimEnd(), fileNames };
}

/**
 * Split the trailing attached-files block off a prompt.
 * Returns the remaining text and the attached paths.
 */
export function splitAttachedFilesBlock(text: string): { text: string; filePaths: string[] } {
  const leadingHeader = `${ATTACHED_FILES_HEADER}\n`;
  const nestedHeader = `\n\n${leadingHeader}`;
  const nestedIndex = text.lastIndexOf(nestedHeader);

  let headerStart: number;
  let bodyStart: number;
  if (nestedIndex !== -1) {
    headerStart = nestedIndex;
    bodyStart = nestedIndex + nestedHeader.length;
  } else if (text.startsWith(leadingHeader)) {
    headerStart = 0;
    bodyStart = leadingHeader.length;
  } else {
    return { text, filePaths: [] };
  }

  const filePaths: string[] = [];
  const bodyLines = text.slice(bodyStart).split('\n');
  let consumedLines = 0;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    // Only treat path-looking lines as attachments; stop at the first one
    // that does not look like a path and keep it and the rest as text.
    if (trimmed && !trimmed.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(trimmed)) break;
    if (trimmed) filePaths.push(trimmed);
    consumedLines += 1;
  }

  if (filePaths.length === 0) {
    return { text, filePaths: [] };
  }
  const before = text.slice(0, headerStart).trimEnd();
  const after = bodyLines.slice(consumedLines).join('\n').trim();
  return { text: [before, after].filter(Boolean).join('\n\n'), filePaths };
}
