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

interface SourcePoint {
  content: Element;
  line: number;
  column: number;
}

/**
 * Every source row, highlighted or plain, marks its text
 * `data-source-content`; the column counts only that text, not the gutter.
 */
function sourcePointFromPoint(x: number, y: number): SourcePoint | null {
  const caret = document.caretPositionFromPoint(x, y);
  if (!caret) return null;
  const element =
    caret.offsetNode instanceof Element ? caret.offsetNode : caret.offsetNode.parentElement;
  const content = element?.closest('[data-source-content]');
  const line = lineNumberAt(caret.offsetNode);
  if (!content || line === null) return null;
  const range = document.createRange();
  range.setStart(content, 0);
  range.setEnd(caret.offsetNode, caret.offset);
  const column = range.toString().length;
  // Past the end of the line the caret snaps to its last character, which is
  // not what was clicked.
  if (column > 0 && column === content.textContent?.length) {
    range.setStart(caret.offsetNode, Math.max(0, caret.offset - 1));
    if (x > range.getBoundingClientRect().right) return null;
  }
  return { content, line, column };
}

/** The source position under a point: a 1-based line and a 0-based column in UTF-16 code units. */
export function sourcePositionFromPoint(
  x: number,
  y: number,
): { line: number; column: number } | null {
  const point = sourcePointFromPoint(x, y);
  return point && { line: point.line, column: point.column };
}

const WORD_CHARACTER = /[\p{L}\p{N}_$]/u;

/**
 * The word under a point, as a range over the row's text nodes (a word may
 * span several highlighted tokens). A caret right after a word belongs to it,
 * as it does for the lookup.
 */
export function sourceWordRangeFromPoint(x: number, y: number): Range | null {
  const point = sourcePointFromPoint(x, y);
  if (!point) return null;
  const text = point.content.textContent ?? '';
  let start = point.column;
  let end = point.column;
  while (start > 0 && WORD_CHARACTER.test(text.charAt(start - 1))) start -= 1;
  while (end < text.length && WORD_CHARACTER.test(text.charAt(end))) end += 1;
  if (start === end) return null;
  const range = document.createRange();
  const walker = document.createTreeWalker(point.content, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (start >= offset && start <= offset + length) range.setStart(node, start - offset);
    if (end >= offset && end <= offset + length) {
      range.setEnd(node, end - offset);
      break;
    }
    offset += length;
  }
  return range;
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

function rowAt(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>('[data-diff-line]') ?? null;
}

/**
 * The next diff row in document order without scanning the container: rows
 * sit flat (unified) or one pair per wrapper (split), so the walk visits only
 * the selected rows, not all 5,000 of them on every scroll frame.
 */
function nextDiffRow(row: HTMLElement, container: HTMLElement): HTMLElement | null {
  let element: Element = row;
  for (;;) {
    const sibling = element.nextElementSibling;
    if (sibling) {
      if (sibling instanceof HTMLElement && sibling.matches('[data-diff-line]')) return sibling;
      const inside = sibling.querySelector<HTMLElement>('[data-diff-line]');
      if (inside) return inside;
      // A hunk header or gap row: nothing selectable, keep moving right.
      element = sibling;
      continue;
    }
    const parent = element.parentElement;
    if (!parent || parent === container) return null;
    element = parent;
  }
}

/**
 * The whole lines a selection touches, in order. Side by side, only the column
 * the selection starts in counts, so a drag down one side never picks up the
 * other; a selection that starts outside every row (select all, or from a
 * hunk header) has no side and takes the rows that carry none.
 */
export function diffLinesFromSelection(container: HTMLElement, range: Range): SelectedDiffLine[] {
  const anchorRow = rowAt(range.startContainer);
  const side = anchorRow?.dataset.diffSide;
  // Without an anchor the walk starts at the container's first row, which may
  // sit above the selection: skip to the first row the range actually covers.
  let row: HTMLElement | null =
    anchorRow ?? container.querySelector<HTMLElement>('[data-diff-line]');
  while (row && !range.intersectsNode(row)) {
    row = nextDiffRow(row, container);
  }
  const lines: SelectedDiffLine[] = [];
  // A range covers one contiguous span, so the first row that falls outside it
  // ends the walk: no need to look at the rows below.
  for (; row && range.intersectsNode(row); row = nextDiffRow(row, container)) {
    if (row.dataset.diffSide === side) {
      const kind = diffKind(row.dataset.diffKind);
      if (kind) {
        lines.push({
          kind,
          text: row.querySelector('[data-diff-text]')?.textContent ?? '',
          newLineNumber: row.dataset.newLine === undefined ? null : Number(row.dataset.newLine),
        });
      }
    }
  }
  return lines;
}
