/** A passage selected from the transcript, with the user's comment on it. */
export interface MessageQuote {
  id: string;
  text: string;
  comment: string;
}

/** Stable empty result for store selectors, so a session without quotes does not re-render. */
export const NO_QUOTES: readonly MessageQuote[] = [];

const QUOTES_MESSAGE_HEADER = 'Comments on quoted passages:';
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
    typeof value.comment === 'string'
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
 *   Comments on quoted passages:
 *   1.
 *   > first quoted line
 *   > second quoted line
 *   the comment
 *   2.
 *   ...
 *   Global comment:
 *   the comment on all of them
 *
 * Without quotes, only the global comment section is sent, with no header.
 *
 * The `> ` prefix already separates the quoted text from the comment and the
 * numbers separate the quotes, so neither needs a label or a blank line; that
 * keeps the message short.
 */
export function formatQuotesMessage(
  quotes: readonly MessageQuote[],
  globalComment: string,
): string {
  const sections = quotes.map((quote, index) => {
    const quotedLines = quote.text.split('\n').map((line) => (line ? `> ${line}` : '>'));
    const comment = quote.comment.trim();
    const lines = [`${index + 1}.`, ...quotedLines];
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
