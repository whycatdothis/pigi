import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import SyntaxHighlightedCode from '../components/message/syntaxHighlightedCode';
import { requireElement } from '../testing/domQuery';
import { sourcePositionFromPoint, sourceWordRangeFromPoint } from './sourceLineSelection';
import '../assets/main.css';

/** The viewport point over the middle of `text`'s `index`-th character on source line `line`. */
function pointOver(container: HTMLElement, line: number, index: number): { x: number; y: number } {
  const content = requireElement<HTMLElement>(
    `[data-source-line="${line}"] [data-source-content]`,
    container,
  );
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (offset + length > index) {
      const range = document.createRange();
      range.setStart(node, index - offset);
      range.setEnd(node, index - offset + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    offset += length;
  }
  throw new Error('index past the line');
}

// An empty language renders the plain rows, as files over the highlight budget do.
test.each([
  ['highlighted', 'typescript'],
  ['plain', ''],
])('maps a point to the line and UTF-16 column on %s rows', async (_name, language) => {
  const code = 'const a = 1;\nconst s = "中文😀"; save();';
  const screen = await render(
    <div className="font-mono">
      <SyntaxHighlightedCode code={code} language={language} lineNumbers />
    </div>,
  );
  const column = code.split('\n')[1]?.indexOf('save') ?? -1;
  // Highlighted rows split the text into token spans once Shiki is done.
  const tokens = (): number =>
    screen.container.querySelectorAll('[data-source-line="2"] [data-source-content] span').length;
  if (language) await expect.poll(tokens).toBeGreaterThan(1);
  const { x, y } = pointOver(screen.container, 2, column + 1);
  const position = sourcePositionFromPoint(x, y);
  expect(position?.line).toBe(2);
  // The caret lands on either side of the clicked character.
  expect([column + 1, column + 2]).toContain(position?.column);
});

test('a point past the end of a line maps to nothing', async () => {
  const screen = await render(
    <div className="font-mono" style={{ width: 600 }}>
      <SyntaxHighlightedCode code={'save();\nx'} language="" lineNumbers />
    </div>,
  );
  const last = pointOver(screen.container, 1, 'save();'.length - 1);
  expect(sourcePositionFromPoint(last.x + 200, last.y)).toBeNull();
});

test('the word under a point spans its tokens, and punctuation has none', async () => {
  const code = 'const s = "中文😀"; save_it();\nx ( ) ;';
  const screen = await render(
    <div className="font-mono">
      <SyntaxHighlightedCode code={code} language="typescript" lineNumbers />
    </div>,
  );
  await expect
    .poll(
      () =>
        screen.container.querySelectorAll('[data-source-line="1"] [data-source-content] span')
          .length,
    )
    .toBeGreaterThan(1);
  const word = pointOver(screen.container, 1, code.indexOf('save_it') + 3);
  expect(sourceWordRangeFromPoint(word.x, word.y)?.toString()).toBe('save_it');
  const paren = pointOver(screen.container, 2, 'x ( '.length);
  expect(sourceWordRangeFromPoint(paren.x, paren.y)).toBeNull();
});
