// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import { installSystemAppearance } from '../../testing/jsdomSetup';

const highlighter = vi.hoisted(() => ({
  codeToTokens: vi.fn(() => ({ tokens: [[{ content: 'token', color: '#ffffff' }]] })),
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
