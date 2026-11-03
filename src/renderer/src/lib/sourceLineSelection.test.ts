// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { diffLinesFromSelection, sourceLineRangeFromSelection } from './sourceLineSelection';

function buildSource(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = [30, 31, 32]
    .map(
      (line) =>
        `<span data-source-line="${line}"><span class="gutter">${line}</span><span>line ${line}</span></span>`,
    )
    .join('');
  document.body.append(root);
  return root;
}

function textNodeIn(root: HTMLElement, line: number): Text {
  const lineElement = root.querySelector<HTMLElement>(`[data-source-line="${line}"]`);
  if (!lineElement) throw new Error(`line ${line} has no element`);
  const textNode = lineElement.lastElementChild?.firstChild;
  if (!(textNode instanceof Text)) throw new Error(`line ${line} has no text`);
  return textNode;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('sourceLineRangeFromSelection', () => {
  it('maps a partial line to a single line', () => {
    const root = buildSource();
    const range = document.createRange();
    range.setStart(textNodeIn(root, 30), 2);
    range.setEnd(textNodeIn(root, 30), 6);
    expect(sourceLineRangeFromSelection(range)).toEqual({ start: 30, end: 30 });
  });

  it('maps a multi-line selection to its first and last line', () => {
    const root = buildSource();
    const range = document.createRange();
    range.setStart(textNodeIn(root, 30), 2);
    range.setEnd(textNodeIn(root, 32), 3);
    expect(sourceLineRangeFromSelection(range)).toEqual({ start: 30, end: 32 });
  });

  it('returns null outside a numbered line', () => {
    const root = buildSource();
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(root, 1);
    expect(sourceLineRangeFromSelection(range)).toBeNull();
  });
});

describe('diffLinesFromSelection', () => {
  type Cell = [kind: string, text: string, newLine?: number];
  const cell = ([kind, text, newLine]: Cell, side?: string): string =>
    `<div data-diff-line data-diff-kind="${kind}"${side ? ` data-diff-side="${side}"` : ''}${
      newLine === undefined ? '' : ` data-new-line="${newLine}"`
    }><span>${newLine ?? ''}</span><span data-diff-text>${text}</span></div>`;

  function build(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.append(root);
    return root;
  }

  const textAt = (root: HTMLElement, index: number): Text => {
    const text = root.querySelectorAll('[data-diff-text]')[index]?.firstChild;
    if (!(text instanceof Text)) throw new Error(`no text at ${index}`);
    return text;
  };

  const select = (root: HTMLElement, from: number, to: number): Range => {
    const range = document.createRange();
    range.setStart(textAt(root, from), 1);
    range.setEnd(textAt(root, to), 1);
    return range;
  };

  const brief = (root: HTMLElement, range: Range): string[] =>
    diffLinesFromSelection(root, range).map(
      (line) => `${line.kind}:${line.text}:${line.newLineNumber ?? '-'}`,
    );

  it('reads whole unified lines with their kind and new line number', () => {
    const root = build(
      [cell(['context', 'keep', 1]), cell(['remove', 'old']), cell(['add', 'new', 2])].join(''),
    );
    expect(brief(root, select(root, 0, 2))).toEqual([
      'context:keep:1',
      'remove:old:-',
      'add:new:2',
    ]);
  });

  it('keeps a side-by-side selection in the column it starts in', () => {
    // Each row is old cell then new cell, so a drag down one column crosses the other in the DOM.
    const rows: [Cell, Cell][] = [
      [
        ['remove', 'old one'],
        ['add', 'new one', 1],
      ],
      [
        ['remove', 'old two'],
        ['add', 'new two', 2],
      ],
      [
        ['context', 'same', 3],
        ['context', 'same', 3],
      ],
    ];
    const root = build(
      rows.map(([left, right]) => `<div>${cell(left, 'old')}${cell(right, 'new')}</div>`).join(''),
    );
    // Text indexes: 0 old one, 1 new one, 2 old two, 3 new two, 4 same (old), 5 same (new).
    expect(brief(root, select(root, 0, 4))).toEqual([
      'remove:old one:-',
      'remove:old two:-',
      'context:same:3',
    ]);
    expect(brief(root, select(root, 1, 5))).toEqual([
      'add:new one:1',
      'add:new two:2',
      'context:same:3',
    ]);
  });
});
