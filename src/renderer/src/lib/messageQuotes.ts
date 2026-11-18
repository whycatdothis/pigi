/**
 * What a selection quotes. `reference` points at where it came from (a file
 * view's `@path…`) and is sent as is; only `text`, the quoted text itself, is
 * blockquoted. Either may be empty, and a quote with neither is a comment with
 * nothing to point at. `branch` is the Git state the quote was read in, kept
 * apart from the reference so one message can state it once.
 */
export interface QuoteContent {
  reference?: string;
  text: string;
  branch?: string;
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
    (!('reference' in value) || typeof value.reference === 'string') &&
    (!('branch' in value) || typeof value.branch === 'string')
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
 *
 * The first line's indentation is kept: a selection can be code, and removing
 * it turns `        if ready:` into a line that no longer means what it did.
 */
export function normalizeQuoteText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * The plain-text message that sends every quote in one turn:
 *
 *   Comments on quotes:
 *   On branch feat/x.
 *   1. > first quoted line
 *   > second quoted line
 *   the comment
 *   2. @src/app.ts:30-50
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
 *
 * A diff quote's branch is stated once above the list when every quote was read
 * on the same one, which is the usual case: a run of quotes from the Git tab
 * would otherwise repeat a long branch name on every item. Quotes from
 * different branches keep theirs on the item, or the line above would be a lie
 * about some of them.
 */
export function formatQuotesMessage(
  quotes: readonly MessageQuote[],
  globalComment: string,
): string {
  const branches = new Set(quotes.map((quote) => quote.branch).filter((branch) => branch));
  const sharedBranch =
    branches.size === 1 && quotes.every((quote) => quote.branch) ? [...branches][0] : null;
  const sections = quotes.map((quote, index) => {
    const quotedLines = quote.text
      ? quote.text.split('\n').map((line) => (line ? `> ${line}` : '>'))
      : [];
    // Without a shared branch above, the branch joins the reference; a quote
    // with nothing else to point at is then just its branch.
    const branch = !sharedBranch && quote.branch ? quote.branch : null;
    const reference = branch
      ? quote.reference
        ? `on branch ${branch}: ${quote.reference}`
        : `on branch ${branch}`
      : quote.reference;
    const [first, ...rest] = reference ? [reference, ...quotedLines] : quotedLines;
    const comment = quote.comment.trim();
    // An empty quote with no reference has no first line; a label with a
    // trailing space and "undefined" is worse than the number alone.
    const lines = [first === undefined ? `${index + 1}.` : `${index + 1}. ${first}`, ...rest];
    if (comment) {
      lines.push(comment);
    }
    return lines.join('\n');
  });
  const trimmedGlobalComment = globalComment.trim();
  if (trimmedGlobalComment) {
    sections.push(`${GLOBAL_COMMENT_HEADER}\n${trimmedGlobalComment}`);
  }
  return [
    ...(quotes.length > 0 ? [QUOTES_MESSAGE_HEADER] : []),
    ...(sharedBranch ? [`On branch ${sharedBranch}.`] : []),
    ...sections,
  ].join('\n');
}
