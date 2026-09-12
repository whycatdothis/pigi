/**
 * Message content text extraction, shared by the utility process (session tree
 * previews, navigate results) and the renderer.
 */

/**
 * Flatten a pi message content field to plain text.
 *
 * Content is either a plain string (simple user messages) or an array of
 * content blocks. Only `text` blocks contribute; thinking blocks, tool calls
 * and images are skipped.
 */
export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const parts: string[] = [];
  for (const block of content) {
    // SDK content blocks are untyped; runtime shape check
    const parsed = block as { type?: string; text?: string };
    if (parsed.type === 'text' && parsed.text) {
      parts.push(parsed.text);
    }
  }
  return parts.join('\n');
}

/** Clip text to `maxLength` characters, appending an ellipsis when clipped. */
export function clipText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Collapse to a single trimmed line for one-line surfaces. */
export function toSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
