/**
 * Fence line at the start of a line: up to three spaces of indent, then three or
 * more backticks or tildes, which is what CommonMark counts as a fence.
 */
const FENCE_LINE = /^ {0,3}(?:`{3,}|~{3,})/;

/**
 * Whether the code block that ends on `endLine` of `source` (1-based, the line
 * numbers the markdown parser reports) is closed by a fence of its own.
 *
 * A block that is still streaming is a code block to the parser either way: its
 * last line is then whatever the message ends with. The code text cannot tell
 * the two apart — a half-written block is a valid prefix of the finished one —
 * but the closing fence is a line of its own, so the parser's own line numbers
 * can.
 */
export function isFenceClosed(source: string, endLine: number): boolean {
  if (!Number.isInteger(endLine) || endLine < 1) {
    return false;
  }

  const line = source.split('\n')[endLine - 1];
  return line !== undefined && FENCE_LINE.test(line);
}
