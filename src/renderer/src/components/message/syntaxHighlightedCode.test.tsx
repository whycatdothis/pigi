// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import { installSystemAppearance } from '../../testing/jsdomSetup';

const highlighter = vi.hoisted(() => ({
  codeToTokens: vi.fn((code: string) => ({
    // A real highlight has one row per code line, and the streaming test
    // depends on how many lines a landed highlight covers.
    tokens: code.split('\n').map((line) => [{ content: line, color: '#ffffff' }]),
  })),
}));

vi.mock('shiki/bundle/full', () => ({
  bundledLanguages: { ts: {} },
  bundledThemes: {
    'one-light': async () => ({ default: { tokenColors: [] } }),
    'one-dark-pro': async () => ({ default: { tokenColors: [] } }),
  },
  createHighlighter: async () => ({
    loadLanguage: async () => undefined,
    loadTheme: async () => undefined,
    codeToTokens: highlighter.codeToTokens,
  }),
}));

const lineAtGate = Array.from(
  { length: 2_500 },
  (_, index) => `const value${index} = ${index};`,
).join('\n');
const linePastGate = `${lineAtGate}\nconst extra = true;`;

beforeEach(() => {
  installSystemAppearance({ dark: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('keeps a file plain when it is past the line gate', async () => {
  render(<SyntaxHighlightedCode code={linePastGate} language="ts" lineNumbers />);
  await act(async () => {});

  expect(highlighter.codeToTokens).not.toHaveBeenCalled();
  expect(document.querySelectorAll('[data-source-line]')).toHaveLength(2_501);
});

test('highlights a file at the line gate', async () => {
  render(<SyntaxHighlightedCode code={lineAtGate} language="ts" lineNumbers />);
  await act(async () => {});

  expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);
});

test('does not count a trailing newline as an extra line', async () => {
  render(<SyntaxHighlightedCode code={`${lineAtGate}\n`} language="ts" lineNumbers />);
  await act(async () => {});

  expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);
});

test('keeps code plain when it is past the character gate', async () => {
  render(<SyntaxHighlightedCode code={'x'.repeat(250_001)} language="ts" />);
  await act(async () => {});

  expect(highlighter.codeToTokens).not.toHaveBeenCalled();
});

test('highlights a file at the character gate', async () => {
  render(<SyntaxHighlightedCode code={'x'.repeat(250_000)} language="ts" />);
  await act(async () => {});

  expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);
});

// Lines at 1,000 characters hit a tokenizer cliff that is not linear (4,340ms
// for 250 of them against 140ms at 990), so the limit has to stay well under it.
test('keeps a long line out of the tokenizer', async () => {
  render(<SyntaxHighlightedCode code={'x'.repeat(401)} language="ts" />);
  await act(async () => {});

  expect(highlighter.codeToTokens).toHaveBeenCalledWith(
    'x'.repeat(401),
    expect.objectContaining({ tokenizeMaxLineLength: 400 }),
  );
});

test('numbers a streamed tail from where the highlight stopped, not the block end', async () => {
  // The first highlight covers lines 21–22; lines 23–24 arrive before it lands
  // again. The tail redraws from line 22 (the highlight's last line may have
  // run on) and each added line gets its own row — not one row labelled 24.
  const { rerender } = render(
    <SyntaxHighlightedCode code={'a\nb'} language="ts" lineNumbers firstLineNumber={21} />,
  );
  await act(async () => {});

  rerender(
    <SyntaxHighlightedCode code={'a\nb\nc\nd'} language="ts" lineNumbers firstLineNumber={21} />,
  );

  const numbers = [...document.querySelectorAll('[data-source-line]')].map((row) =>
    row.getAttribute('data-source-line'),
  );
  expect(numbers).toEqual(['21', '22', '23', '24']);
});

test('keeps the gutter numbers out of a selection, which now becomes the quote', () => {
  render(<SyntaxHighlightedCode code={'const a = 1;\nconst b = 2;'} language="ts" lineNumbers />);

  // The row is selectable; the gutter cell is not, or a dragged quote would
  // read `11const a = 1;` and send the number to the agent.
  const gutter = document.querySelector('[data-source-line="1"] > [data-sticky-inset]');
  expect(gutter?.className).toContain('select-none');
  expect(document.querySelector('[data-source-line="1"]')?.className).not.toContain('select-none');
});
