import {
  type ToolNode,
  getCodemodeDetails,
  getEditDiffDetails,
  getToolArgs,
} from '../state/transcriptController';
import {
  TOOL_BLOCK_BODY_MAX_HEIGHT,
  TOOL_BLOCK_BODY_MAX_HEIGHT_LARGE,
  TOOL_BLOCK_BODY_MIN_HEIGHT_LARGE,
} from './layoutConstants';

export interface ToolCommandParts {
  prefix: string;
  body: string;
}

/**
 * Commands render as a single line everywhere (tool card, read-group labels,
 * activity feed): collapse newlines to spaces so a multi-line script never
 * breaks the one-line layout or the middle-truncation.
 */
export function collapseCommandNewlines(command: string): string {
  return command.replace(/\s*\n\s*/g, ' ');
}

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

/** Regex for the [N more lines in file…] hint emitted by the pi read tool. */
export const READ_MORE_LINES_RE = /^\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/;

/** Regex for the read tool's image-detection header line. */
export const READ_IMAGE_RE = /^Read image file \[(.+)\]$/;

export function getToolCommandParts(node: ToolNode): ToolCommandParts {
  if (node.name === 'codemode') {
    const calls = getCodemodeDetails(node)?.calls ?? [];
    if (calls.length > 0) {
      return { prefix: node.name, body: describeCodemodeCalls(calls) };
    }
    const script = getCodemodeScript(node);
    return { prefix: node.name, body: script ? `${countLines(script)} lines` : '' };
  }
  return getToolCommandPartsForTool(node.name, getToolArgs(node));
}

/** The header `codemode` puts in front of every script's output. */
const CODEMODE_OUTPUT_HEADER = /^Script (?:completed|failed)\nWall time [\d.]+ seconds\nOutput:\n+/;

/**
 * The script a `codemode` call runs. Its input is raw JavaScript rather than
 * JSON, so it cannot go through the argument formatting the other tools use.
 */
export function getCodemodeScript(node: ToolNode): string | null {
  if (node.name !== 'codemode') return null;
  const code = getToolArgs(node)?.code;
  if (typeof code !== 'string') return null;
  const script = code.replace(/\r/g, '').trimEnd();
  return script.length > 0 ? script : null;
}

/**
 * What a script called, in the order it first called them, as `read ×2, bash`.
 * The rows below the script say the same thing one call at a time; the title
 * needs it on one line.
 */
export function describeCodemodeCalls(calls: readonly { name: string }[]): string {
  const counts = new Map<string, number>();
  for (const call of calls) {
    counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(', ');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A nested call's line, formatted like the same call at the top level would be:
 * the SDK stores its arguments as compact JSON, which reads as noise.
 */
export function getCodemodeCallParts(call: { name: string; args: string }): ToolCommandParts {
  let args: unknown;
  try {
    args = JSON.parse(call.args);
  } catch {
    args = undefined;
  }
  // The SDK truncates long arguments at 200 characters, so a call with a file's
  // content never parses. Its line is then just the tool's name; the raw
  // arguments stay on the row's title.
  return isPlainObject(args)
    ? getToolCommandPartsForTool(call.name, args)
    : { prefix: call.name, body: '' };
}

/**
 * Same formatting as `getToolCommandParts`, for callers that only have a tool
 * name and arguments (the session tree dialog's rows).
 */
export function getToolCommandPartsForTool(
  name: string,
  args: Record<string, unknown> | undefined,
): ToolCommandParts {
  switch (name) {
    case 'bash':
      return { prefix: '$', body: collapseCommandNewlines(String(args?.command ?? '')) };
    case 'read': {
      const path = String(args?.path ?? '');
      const offset = typeof args?.offset === 'number' ? args.offset : undefined;
      const limit = typeof args?.limit === 'number' ? args.limit : undefined;
      let body = path;
      if (offset != null || limit != null) {
        const from = offset ?? 1;
        const to = limit != null ? from + limit - 1 : undefined;
        body += to != null ? `:${from}-${to}` : `:${from}`;
      }
      return { prefix: name, body };
    }
    case 'write':
    case 'edit':
      return { prefix: name, body: String(args?.path ?? '') };
    case 'codemode': {
      const script = typeof args?.code === 'string' ? args.code : '';
      return { prefix: name, body: script ? `${countLines(script)} lines` : '' };
    }
    default: {
      if (!args) return { prefix: name, body: '' };
      // Show the first string argument value as context, on a single line
      // like every other command body (a multi-line first argument would
      // break the same one-line surfaces).
      const firstValue = Object.values(args).find((v) => typeof v === 'string');
      return {
        prefix: name,
        body: typeof firstValue === 'string' ? collapseCommandNewlines(firstValue) : '',
      };
    }
  }
}

/**
 * Filter hint lines and image headers from read tool output so the
 * searchable text matches what ToolBlock actually renders.
 */
export function cleanReadOutput(node: ToolNode): string {
  if (node.name !== 'read') return node.output;
  const lines = node.output.split('\n');
  if (lines[0]?.match(READ_IMAGE_RE)) return '';
  return lines.filter((line) => !READ_MORE_LINES_RE.test(line)).join('\n');
}

/**
 * Output as the card shows it: the codemode status header the card already
 * repeats in its own rows is dropped, read tool hints are filtered.
 */
export function cleanToolOutput(node: ToolNode): string {
  const output = cleanReadOutput(node);
  return node.name === 'codemode' ? output.replace(CODEMODE_OUTPUT_HEADER, '') : output;
}

/**
 * Text content as rendered by ToolBlock — used as the search target so
 * occurrence indices match DOM tree order.
 */
export function getToolSearchText(node: ToolNode): string {
  const args = getToolArgs(node);
  if (node.name === 'write' && node.status !== 'error') {
    return typeof args?.content === 'string' ? args.content : '';
  }
  if (node.name === 'edit' && node.status !== 'error') {
    return getEditDiffDetails(node)?.diff ?? '';
  }
  if (node.name === 'codemode') {
    // The script renders above the output, so the two are one search target in
    // that order.
    const output = cleanToolOutput(node);
    return [getCodemodeScript(node), output].filter(Boolean).join('\n');
  }
  return cleanReadOutput(node);
}

export interface ToolBlockBodyHeightRange {
  minHeight?: number;
  /** Omit to let the body take the height it needs. */
  maxHeight?: number;
}

/**
 * Collapsed body height bounds; only edit/write reserve a floor and grow taller.
 * A codemode card is not clamped at all: its script has a well of its own with
 * the card's only "Show more", and the output is what the model came back with.
 */
export function getToolBlockBodyHeightRange(node: ToolNode): ToolBlockBodyHeightRange {
  if (node.name === 'edit' || node.name === 'write') {
    return {
      minHeight: TOOL_BLOCK_BODY_MIN_HEIGHT_LARGE,
      maxHeight: TOOL_BLOCK_BODY_MAX_HEIGHT_LARGE,
    };
  }
  if (node.name === 'codemode') {
    return { maxHeight: undefined };
  }
  return { maxHeight: TOOL_BLOCK_BODY_MAX_HEIGHT };
}
