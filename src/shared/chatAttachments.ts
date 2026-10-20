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

/** Marker that introduces the list of attached file paths in a prompt. */
export const ATTACHED_FILES_HEADER = '[Attached files]';

/** Marker used as message text when the user sent attachments without text. */
const ATTACHED_SUMMARY_RE =
  /^\s*\[Attached \d+ (?:images?|files?)(?:, \d+ (?:images?|files?))?\]\s*\n?/;

const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const SUPPORTED_IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

// Only the blocks promptAttachments generates are stripped: an inline text
// file (`\nCONTENT\n`), or one of the generated status lines. User-typed
// `<file>` markup in prose is left alone.
const INLINE_FILE_BLOCK_RE =
  /<file name="[^"\n]*">(?:File too large to include \(\d+ bytes\)\.|Binary file \(\d+ bytes\)\.|File not found: [^\n<]*|Failed to attach: [^\n<]*|\n[\s\S]*?\n)<\/file>\n?/g;

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
} {
  return splitAttachedFilesBlock(stripInlineFileBlocks(stripAttachmentSummary(text)));
}

/** Strip inline `<file>` blocks (clipboard files inlined without a path). */
export function stripInlineFileBlocks(text: string): string {
  return text.replace(INLINE_FILE_BLOCK_RE, '').trimEnd();
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
  for (const line of text.slice(bodyStart).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Only treat path-looking lines as attachments; stop at the first one
    // that does not look like a path so trailing user text is never eaten.
    const isPath = trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed);
    if (!isPath) break;
    filePaths.push(trimmed);
  }

  if (filePaths.length === 0) {
    return { text, filePaths: [] };
  }
  return { text: text.slice(0, headerStart).trimEnd(), filePaths };
}
