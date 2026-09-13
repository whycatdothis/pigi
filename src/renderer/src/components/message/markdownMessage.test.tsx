// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import MarkdownMessage from './markdownMessage';

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
  createHighlighter: async () => ({
    loadLanguage: async () => undefined,
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

    // The interval passes: one highlight catches the block up, with the text it
    // has by then rather than the text it had when the throttle started.
    await act(async () => {
      vi.advanceTimersByTime(60);
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
  const { rerender } = render(
    <MarkdownMessage text={messageWithChunk('tail', grownLines(1))} isStreaming />,
  );
  await act(async () => {});

  rerender(<MarkdownMessage text={messageWithChunk('tail', grownLines(2))} isStreaming />);
  // The highlight on screen is still the one for the shorter text; what arrived
  // since is drawn as plain text after it, so the reader watches the file grow
  // instead of waiting for the next highlight.
  expect(plainTail()).toContain('// 1');
});

test('moves the plain tail into the highlight when the next one lands', async () => {
  vi.useFakeTimers();
  try {
    const { rerender } = render(
      <MarkdownMessage text={messageWithChunk('catching', grownLines(1))} isStreaming />,
    );
    await act(async () => {});
    rerender(<MarkdownMessage text={messageWithChunk('catching', grownLines(2))} isStreaming />);
    expect(plainTail()).toContain('// 1');

    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    await act(async () => {});
    // The tail is gone: the line it held is part of the highlight now.
    expect(plainTail()).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
