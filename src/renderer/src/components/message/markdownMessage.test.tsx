// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import MarkdownMessage from './markdownMessage';
import { installSystemAppearance } from '../../testing/jsdomSetup';

// Shiki is the cost this file is about, so the highlighter is a counter: how
// often a block is tokenized again is the thing being asserted, and the real
// highlighter would only make the test slow.
const highlighter = vi.hoisted(() => ({
  codeToTokens: vi.fn(() => ({ tokens: [[{ content: 'token', color: '#ffffff' }]] })),
}));

vi.mock('shiki/bundle/full', () => ({
  // The component asks whether a language is bundled before it highlights it;
  // anything not listed here is rendered as plain text instead.
  bundledLanguages: { ts: {}, typescript: {} },
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

/**
 * A message with one fenced code block, as the transcript re-renders it per
 * chunk. `tag` makes each test's block a code string no other test has asked
 * for: highlights are cached by their text, so reusing one would make a count
 * depend on the order the tests ran in.
 *
 * `chunk` is what the block holds after the opening line, and it always keeps
 * the lines before it: streaming appends, it never rewrites what arrived.
 */
function messageWithChunk(tag: string, chunk: string): string {
  return ['Intro text.', '', '```ts', `const ${tag} = 42;`, chunk, '```'].join('\n');
}

/** The body of a block that has grown this many lines so far. */
function grownLines(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, index) => `// ${String(index)}`).join('\n');
}

/**
 * The text drawn as plain text after the highlight: the last highlighted line
 * (which the arrival may have run on inside) and everything after it.
 */
function plainTail(): string | null {
  return document.querySelector('code > span.whitespace-pre-wrap')?.textContent ?? null;
}

test('highlights a streaming code block once per interval, not once per chunk', async () => {
  vi.useFakeTimers();
  try {
    const { rerender } = render(
      <MarkdownMessage text={messageWithChunk('streaming', grownLines(1))} isStreaming />,
    );
    await act(async () => {});
    expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);

    // Ten chunks arriving: the message re-renders with a longer code block each
    // time, and the block is not tokenized again for any of them.
    for (let lineCount = 2; lineCount <= 11; lineCount += 1) {
      await act(async () => {
        rerender(
          <MarkdownMessage
            text={messageWithChunk('streaming', grownLines(lineCount))}
            isStreaming
          />,
        );
      });
    }
    expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);

    // The intervals pass, one stage at a time: the message's own parse throttle
    // first, then the highlight's. One highlight catches the block up, with the
    // text it has by then rather than the text it had when the throttle started.
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(highlighter.codeToTokens).toHaveBeenCalledTimes(2);
    expect(highlighter.codeToTokens).toHaveBeenLastCalledWith(
      expect.stringContaining('// 10'),
      expect.anything(),
    );
  } finally {
    vi.useRealTimers();
  }
});

test('highlights the last chunk at once when the message stops streaming', async () => {
  const { rerender } = render(
    <MarkdownMessage text={messageWithChunk('finishing', grownLines(1))} isStreaming />,
  );
  await act(async () => {});

  rerender(
    <MarkdownMessage text={messageWithChunk('finishing', grownLines(2))} isStreaming={false} />,
  );
  await act(async () => {});
  // No interval to wait for once the message is whole: the reader is not left
  // looking at a plain tail.
  expect(highlighter.codeToTokens).toHaveBeenLastCalledWith(
    expect.stringContaining('// 1'),
    expect.anything(),
  );
});

test('highlights a block in a message that is not streaming', async () => {
  render(<MarkdownMessage text={messageWithChunk('whole', grownLines(1))} />);
  await act(async () => {});
  expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);
});

test('keeps the text that arrived since the last highlight visible', async () => {
  vi.useFakeTimers();
  try {
    const { rerender } = render(
      <MarkdownMessage text={messageWithChunk('tail', grownLines(1))} isStreaming />,
    );
    await act(async () => {});

    // What the message draws is throttled too: one stage to re-parse it with the
    // line that arrived, and the highlight is still the one for the shorter text.
    rerender(<MarkdownMessage text={messageWithChunk('tail', grownLines(2))} isStreaming />);
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    // So the new line is drawn as plain text after the highlight, and the reader
    // watches the file grow instead of waiting for the next highlight.
    expect(plainTail()).toContain('// 1');
  } finally {
    vi.useRealTimers();
  }
});

test('moves the plain tail into the highlight when the next one lands', async () => {
  vi.useFakeTimers();
  try {
    const { rerender } = render(
      <MarkdownMessage text={messageWithChunk('catching', grownLines(1))} isStreaming />,
    );
    await act(async () => {});
    rerender(<MarkdownMessage text={messageWithChunk('catching', grownLines(2))} isStreaming />);
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(plainTail()).toContain('// 1');

    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    // The tail is gone: the line it held is part of the highlight now.
    expect(plainTail()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('draws raw HTML in a message as text, never as markup', () => {
  // Model output is the untrusted input this renderer was built around: a reply
  // that echoes a page can contain the very tags that would run.
  render(
    <MarkdownMessage
      text={[
        '<script>alert(1)</script>',
        '',
        '<img src=x onerror="alert(2)">',
        '',
        '[link](javascript:alert(3))',
      ].join('\n')}
    />,
  );

  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('img')).toBeNull();
  // A `javascript:` href is dropped by the sanitizer; the anchor may survive
  // without one, so what matters is that no anchor can run a script.
  for (const anchor of document.querySelectorAll('a')) {
    expect(anchor.getAttribute('href') ?? '').not.toMatch(/^(javascript|data|vbscript):/i);
  }
  // The tags are not escaped into the text either: react-markdown without
  // rehype-raw drops raw HTML nodes, and the reply renders only its prose.
  expect(document.body.textContent).not.toContain('alert(1)');
  expect(document.body.textContent).toContain('link');
});

beforeEach(() => {
  installSystemAppearance({ dark: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
