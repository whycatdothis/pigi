/**
 * Container syntax in front of a fence: indentation, block quotes and list
 * markers. A fence inside a list carries the list's indent, so the prefix is what
 * an opener and its closer have to agree on rather than a fixed three spaces.
 */
const CONTAINER_PREFIX = /^(?:\s+|>\s?|[-*+]\s+|\d{1,9}[.)]\s+)*/;

/** A fence that opens a block: the run itself, then anything as the info string. */
const OPENING_FENCE = /^(`{3,}|~{3,})(.*)$/;

/**
 * A fence that closes one: the run alone on its line. An info string makes the
 * line an opener of the next block instead, which is the difference between "the
 * diagram finished" and "the model started another block".
 */
const CLOSING_FENCE = /^(`{3,}|~{3,})[ \t]*$/;

interface FenceParts {
  prefixLength: number;
  rest: string;
}

function splitContainerPrefix(line: string): FenceParts {
  const prefix = CONTAINER_PREFIX.exec(line)?.[0] ?? '';
  return { prefixLength: prefix.length, rest: line.slice(prefix.length) };
}

/**
 * Whether the code block that starts on `startLine` and ends on `endLine` of
 * `source` (1-based, the line numbers the markdown parser reports) is closed by
 * a fence of its own.
 *
 * A block that is still streaming is a code block to the parser either way: its
 * last line is then whatever the message ends with. The code text cannot tell
 * the two apart — a half-written block is a valid prefix of the finished one —
 * but the closing fence is a line of its own, so the parser's own line numbers
 * can.
 *
 * The closing fence is held to the CommonMark rules, because each one of them is
 * a real shape in a model's output: it has no info string (`` ```mermaid `` on
 * the last line is a new block, not the end of this one), it is at least as long
 * as the opener (four backticks do not close a three-backtick block, and three
 * do not close a four-backtick one), it uses the same character, and it is
 * indented no deeper than the opener plus three.
 */
export function isFenceClosed(source: string, startLine: number, endLine: number): boolean {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return false;
  }
  if (startLine < 1 || endLine <= startLine) {
    return false;
  }

  const lines = source.split('\n');
  const openingLine = lines[startLine - 1];
  const closingLine = lines[endLine - 1];
  if (openingLine === undefined || closingLine === undefined) {
    return false;
  }

  const opening = splitContainerPrefix(openingLine);
  const closing = splitContainerPrefix(closingLine);
  const openingFence = OPENING_FENCE.exec(opening.rest);
  const closingFence = CLOSING_FENCE.exec(closing.rest);
  if (openingFence === null || closingFence === null) {
    return false;
  }

  const openingRun = openingFence[1];
  const closingRun = closingFence[1];
  if (openingRun[0] !== closingRun[0] || closingRun.length < openingRun.length) {
    return false;
  }

  return closing.prefixLength <= opening.prefixLength + 3;
}
