/**
 * Inline references in the chat composer.
 *
 * The composer shows references as chips, but drafts, history and the prompt
 * sent to pi stay plain text. These helpers convert between the two: chips
 * serialize to `/command` or `@path`, and plain text is parsed back into
 * references when it is restored into the composer.
 */
export type ChatReferenceKind = 'skill' | 'file';

export interface ChatReference {
  kind: ChatReferenceKind;
  /** Start offset in the text. */
  start: number;
  /** Exclusive end offset in the text. */
  end: number;
  /** Exact serialized text, e.g. `/skill:review` or `@src/main.ts`. */
  value: string;
  /** Command name or file path the reference points to. */
  id: string;
}

/**
 * Skill invocations only expand when they start the prompt, so only the
 * leading `/...` token counts. Membership is checked against the commands the
 * session actually exposes.
 */
const LEADING_COMMAND_PATTERN = /^\/([A-Za-z0-9][A-Za-z0-9:_.-]*)/;

/**
 * A file reference is `@path` at a word boundary. Quoted paths (`@"a b.ts"`)
 * preserve spaces.
 */
const FILE_REFERENCE_PATTERN = /(^|[\s(])(@(?:"[^"\n]+"|[^\s@]+))/g;

/** Punctuation that usually follows a path in a sentence rather than being part of it. */
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?)\]}]+$/;

export interface FindChatReferencesOptions {
  /** Parse `@path` tokens. Off for pasted text, where `@` often means something else. */
  fileReferences?: boolean;
}

/** Find references in plain text, sorted by position. */
export function findChatReferences(
  text: string,
  commandNames: ReadonlySet<string>,
  { fileReferences = true }: FindChatReferencesOptions = {},
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
      id: leading[1],
    });
  }

  if (!fileReferences) return references;

  for (const match of text.matchAll(FILE_REFERENCE_PATTERN)) {
    const boundary = match[1];
    const token = match[2];
    const quoted = token.startsWith('@"');
    const value = quoted ? token : token.replace(TRAILING_PUNCTUATION_PATTERN, '');
    if (value.length <= 1) continue;
    const start = (match.index ?? 0) + boundary.length;
    const id = quoted ? value.slice(2, -1) : value.slice(1);
    references.push({ kind: 'file', start, end: start + value.length, value, id });
  }

  return references.sort((a, b) => a.start - b.start);
}

/** Serialize a file path as an `@` reference, quoting paths with spaces. */
export function formatFileReference(path: string): string {
  return /\s/.test(path) ? `@"${path}"` : `@${path}`;
}
