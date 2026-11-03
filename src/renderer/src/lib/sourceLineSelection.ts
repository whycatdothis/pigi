import type { GitDiffSourceLine } from './gitDiffPatch';

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

export interface SelectedDiffLine {
  kind: GitDiffSourceLine['kind'];
  text: string;
  newLineNumber: number | null;
}

function diffKind(value: string | undefined): GitDiffSourceLine['kind'] | null {
  return value === 'add' || value === 'remove' || value === 'context' ? value : null;
}

/**
 * The whole lines a selection touches, in order. Side by side, only the column
 * the selection starts in counts, so a drag down one side never picks up the
 * other.
 */
export function diffLinesFromSelection(container: HTMLElement, range: Range): SelectedDiffLine[] {
  const start = range.startContainer;
  const startElement = start instanceof Element ? start : start.parentElement;
  const side = startElement?.closest<HTMLElement>('[data-diff-line]')?.dataset.diffSide;
  const lines: SelectedDiffLine[] = [];
  for (const row of container.querySelectorAll<HTMLElement>('[data-diff-line]')) {
    if (!range.intersectsNode(row) || row.dataset.diffSide !== side) continue;
    const kind = diffKind(row.dataset.diffKind);
    if (!kind) continue;
    lines.push({
      kind,
      text: row.querySelector('[data-diff-text]')?.textContent ?? '',
      newLineNumber: row.dataset.newLine === undefined ? null : Number(row.dataset.newLine),
    });
  }
  return lines;
}
