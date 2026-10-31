// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { sourceLineRangeFromSelection } from './sourceLineSelection';

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
