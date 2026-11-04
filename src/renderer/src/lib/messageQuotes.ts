/**
 * What a selection quotes. `reference` points at where it came from (a file
 * view's `@path…`) and is sent as is; only `text`, the quoted text itself, is
 * blockquoted. A line-range reference carries no text, so `text` may be empty.
 */
export interface QuoteContent {
  reference?: string;
  text: string;
}

/** A selection quoted from the transcript or a file view, with the user's comment on it. */
export interface MessageQuote extends QuoteContent {
  id: string;
  comment: string;
}

/** Stable empty result for store selectors, so a session without quotes does not re-render. */
export const NO_QUOTES: readonly MessageQuote[] = [];

const QUOTES_MESSAGE_HEADER = 'Comments on quotes:';
const GLOBAL_COMMENT_HEADER = 'Global comment:';

function isMessageQuote(value: unknown): value is MessageQuote {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'comment' in value &&
    typeof value.comment === 'string' &&
    (!('reference' in value) || typeof value.reference === 'string')
  );
}

/** One session's stored quotes without malformed entries, or undefined when none remain. */
export function parseStoredQuotes(value: unknown): MessageQuote[] | undefined {
  const quotes = Array.isArray(value) ? value.filter(isMessageQuote) : [];
  return quotes.length > 0 ? quotes : undefined;
}

/**
 * Text selected across rendered markdown carries the layout's spacing: padded
 * lines and runs of blank lines between blocks. Keep single blank lines, which
 * still separate paragraphs.
 */
export function normalizeQuoteText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The plain-text message that sends every quote in one turn:
 *
 *   Comments on quotes:
 *   1. > first quoted line
 *   > second quoted line
 *   the comment
 *   2. @src/app.ts:L30-L50
 *   3. @docs/readme.md
 *   > quoted text
 *   Global comment:
 *   the comment on all of them
 *
 * Without quotes, only the global comment section is sent, with no header.
 *
 * The `> ` prefix already separates the quoted text from the comment and the
 * numbers separate the quotes, so neither needs a label or a blank line; that
 * keeps the message short. The number opens the quote's first line instead of
 * standing on a line of its own. A reference is not quoted text, so it opens
 * the quote unmarked.
 */
export function formatQuotesMessage(
  quotes: readonly MessageQuote[],
  globalComment: string,
): string {
  const sections = quotes.map((quote, index) => {
    const quotedLines = quote.text
      ? quote.text.split('\n').map((line) => (line ? `> ${line}` : '>'))
      : [];
    const [first, ...rest] = quote.reference ? [quote.reference, ...quotedLines] : quotedLines;
    const comment = quote.comment.trim();
    const lines = [`${index + 1}. ${first}`, ...rest];
    if (comment) {
      lines.push(comment);
    }
    return lines.join('\n');
  });
  const trimmedGlobalComment = globalComment.trim();
  if (trimmedGlobalComment) {
    sections.push(`${GLOBAL_COMMENT_HEADER}\n${trimmedGlobalComment}`);
  }
  return [...(quotes.length > 0 ? [QUOTES_MESSAGE_HEADER] : []), ...sections].join('\n');
}
