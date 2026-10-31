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

const sixLines = Array.from({ length: 6 }, (_, index) => `const value${index} = ${index};`).join(
  '\n',
);
const fiveLines = Array.from({ length: 5 }, (_, index) => `const value${index} = ${index};`).join(
  '\n',
);

beforeEach(() => {
  installSystemAppearance({ dark: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('keeps a file plain when it is past the line gate', async () => {
  render(
    <SyntaxHighlightedCode
      code={sixLines}
      language="ts"
      lineNumbers
      maxHighlightLines={5}
      maxHighlightLength={100_000}
    />,
  );
  await act(async () => {});

  expect(highlighter.codeToTokens).not.toHaveBeenCalled();
  expect(document.querySelectorAll('[data-source-line]')).toHaveLength(6);
});

test('highlights a file at the line gate', async () => {
  render(
    <SyntaxHighlightedCode
      code={fiveLines}
      language="ts"
      lineNumbers
      maxHighlightLines={5}
      maxHighlightLength={100_000}
    />,
  );
  await act(async () => {});

  expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);
});

test('does not count a trailing newline as an extra line', async () => {
  render(
    <SyntaxHighlightedCode
      code={`${fiveLines}\n`}
      language="ts"
      lineNumbers
      maxHighlightLines={5}
      maxHighlightLength={100_000}
    />,
  );
  await act(async () => {});

  expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);
});
