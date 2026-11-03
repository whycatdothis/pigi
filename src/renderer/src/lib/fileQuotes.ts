import { formatFileReference } from './chatReferences';
import { DIFF_LINE_PREFIX, type GitDiffSourceLine } from './gitDiffPatch';

/** A path as a pi file reference, relative to the project root. */
export function formatFileLineQuote(path: string, startLine: number, endLine: number): string {
  const first = Math.min(startLine, endLine);
  const last = Math.max(startLine, endLine);
  const reference = formatFileReference(path);
  if (last === first) {
    return `${reference}:L${first}`;
  }
  return `${reference}:L${first}-L${last}`;
}

/**
 * A rendered markdown passage has no source lines to point at, so the quote
 * carries the text itself: `@docs/readme.md > the selected passage`.
 */
export function formatFileContentQuote(path: string, text: string): string {
  const lines = text.split('\n');
  return [
    `${formatFileReference(path)} > ${lines[0] ?? ''}`,
    ...lines.slice(1).map((line) => (line ? `> ${line}` : '>')),
  ].join('\n');
}

/**
 * Diff lines the agent cannot open by line number (deleted, or from a commit),
 * as a unified diff under what they were compared with, so it reads them as
 * removed or added code rather than the file's current text:
 * `@src/app.ts, diff against origin/main:` then `-old` / `+new` lines.
 */
export function formatFileDiffQuote(
  path: string,
  scope: string,
  lines: readonly Pick<GitDiffSourceLine, 'kind' | 'text'>[],
): string {
  return [
    `${formatFileReference(path)}, ${scope}:`,
    ...lines.map((line) => `${DIFF_LINE_PREFIX[line.kind]}${line.text}`),
  ].join('\n');
}
