/** A passage selected from the transcript, with the user's comment on it. */
export interface MessageQuote {
  id: string;
  text: string;
  comment: string;
}

/** Stable empty result for store selectors, so a session without quotes does not re-render. */
export const NO_QUOTES: readonly MessageQuote[] = [];

const QUOTES_MESSAGE_HEADER = 'Comments on quoted passages:';

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
 *
 *   1.
 *   > first quoted line
 *   > second quoted line
 *   the comment
 *
 *   2.
 *   ...
 *
 * The `> ` prefix already separates the quoted text from the comment, so the
 * comment needs no label; that keeps the message short.
 */
export function formatQuotesMessage(quotes: readonly MessageQuote[]): string {
  const sections = quotes.map((quote, index) => {
    const quotedLines = quote.text.split('\n').map((line) => (line ? `> ${line}` : '>'));
    const comment = quote.comment.trim();
    const lines = [`${index + 1}.`, ...quotedLines];
    if (comment) {
      lines.push(comment);
    }
    return lines.join('\n');
  });
  return [QUOTES_MESSAGE_HEADER, ...sections].join('\n\n');
}
