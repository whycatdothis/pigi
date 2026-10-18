/**
 * Inline references in the chat composer.
 *
 * The composer is a plain textarea; references stay literal text so drafts,
 * history recall and copy/paste keep working. The highlight layer parses that
 * text and styles tokens without changing their characters, which keeps the
 * overlaid textarea caret aligned. New reference kinds only need a parser
 * branch here and a style entry in the highlight layer.
 */
export type ChatReferenceKind = 'skill' | 'file';

export interface ChatReference {
  kind: ChatReferenceKind;
  /** Start offset in the composer text. */
  start: number;
  /** Exclusive end offset in the composer text. */
  end: number;
  /** Exact serialized text, e.g. `/skill:review` or `@src/main.ts`. */
  value: string;
}

export interface ChatReferenceSegment {
  start: number;
  end: number;
  reference: ChatReference | null;
}

export interface FileMentionContext {
  /** Offset of the `@` that starts the mention. */
  start: number;
  /** Text typed after the `@`, up to the caret. */
  query: string;
}

/**
 * Skill invocations only expand when they start the prompt, so only highlight
 * the leading `/...` token. Membership is checked against the commands the
 * session actually exposes.
 */
const LEADING_COMMAND_PATTERN = /^\/([A-Za-z0-9][A-Za-z0-9:_.-]*)/;

/**
 * A file reference is `@path` at a word boundary. Quoted paths (`@"a b.ts"`)
 * preserve spaces for files the picker inserts.
 */
const FILE_REFERENCE_PATTERN = /(^|[\s(])(@(?:"[^"\n]+"|[^\s@]+))/g;

/** Punctuation that usually follows a path in a sentence rather than being part of it. */
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?)\]}]+$/;

/**
 * Find references in composer text. Ranges are sorted and can be rendered as
 * highlight segments.
 */
export function findChatReferences(
  text: string,
  commandNames: ReadonlySet<string>,
): ChatReference[] {
  if (text.length === 0) return [];

  const references: ChatReference[] = [];

  const leading = LEADING_COMMAND_PATTERN.exec(text);
  if (leading && commandNames.has(leading[1])) {
    references.push({
      kind: 'skill',
      start: 0,
      end: leading[0].length,
      value: leading[0],
    });
  }

  for (const match of text.matchAll(FILE_REFERENCE_PATTERN)) {
    const boundary = match[1];
    const token = match[2];
    const quoted = token.startsWith('@"');
    const value = quoted ? token : token.replace(TRAILING_PUNCTUATION_PATTERN, '');
    if (value.length <= 1) continue;
    const start = (match.index ?? 0) + boundary.length;
    references.push({ kind: 'file', start, end: start + value.length, value });
  }

  return references.sort((a, b) => a.start - b.start);
}

/** Split text into plain and reference segments for the highlight layer. */
export function buildChatReferenceSegments(
  text: string,
  references: ChatReference[],
): ChatReferenceSegment[] {
  if (text.length === 0) return [];

  const segments: ChatReferenceSegment[] = [];
  let cursor = 0;

  for (const reference of references) {
    if (reference.start < cursor) continue;
    if (reference.start > cursor) {
      segments.push({ start: cursor, end: reference.start, reference: null });
    }
    segments.push({ start: reference.start, end: reference.end, reference });
    cursor = reference.end;
  }

  if (cursor < text.length) {
    segments.push({ start: cursor, end: text.length, reference: null });
  }

  return segments;
}

/**
 * Find an active `@` mention around the caret. Mentions start after whitespace
 * or `(` so email addresses do not open the file picker.
 */
export function findFileMentionContext(text: string, caret: number): FileMentionContext | null {
  const beforeCaret = text.slice(0, caret);
  const atIndex = beforeCaret.lastIndexOf('@');
  if (atIndex === -1) return null;

  const previous = beforeCaret[atIndex - 1];
  if (previous !== undefined && !/[\s(]/.test(previous)) return null;

  const query = beforeCaret.slice(atIndex + 1);
  if (query.length > 0 && /[\s"]/.test(query)) return null;

  return { start: atIndex, query };
}

/** Serialize a picked file path for insertion after `@`. */
export function formatFileReference(path: string): string {
  return /\s/.test(path) ? `@"${path}" ` : `@${path} `;
}
