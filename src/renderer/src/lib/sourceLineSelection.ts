/**
 * The source lines a DOM selection covers in the file viewer. Every rendered
 * line carries `data-source-line`, so the range's boundary nodes locate the
 * numbers without counting line breaks in the selected text.
 */
export function sourceLineRangeFromSelection(range: Range): { start: number; end: number } | null {
  const startLine = lineNumberAt(range.startContainer);
  const endLine = lineNumberAt(range.endContainer);
  if (startLine === null || endLine === null) {
    return null;
  }
  return {
    start: Math.min(startLine, endLine),
    end: Math.max(startLine, endLine),
  };
}

function lineNumberAt(node: Node): number | null {
  const element = node instanceof Element ? node : node.parentElement;
  const line = element?.closest('[data-source-line]');
  const value = line?.getAttribute('data-source-line');
  if (!value) return null;
  const lineNumber = Number(value);
  return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : null;
}
