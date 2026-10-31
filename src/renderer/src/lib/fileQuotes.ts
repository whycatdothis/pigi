import { formatFileReference } from './chatReferences';

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
