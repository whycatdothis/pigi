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
 */
function messageWithChunk(tag: string, chunk: string): string {
  return ['Intro text.', '', '```ts', `const ${tag} = 42;`, chunk, '```'].join('\n');
}

test('highlights a streaming code block once per interval, not once per chunk', async () => {
  vi.useFakeTimers();
  try {
    const { rerender } = render(
      <MarkdownMessage text={messageWithChunk('streaming', '// 0')} isStreaming />,
    );
    await act(async () => {});
    expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);

    // Ten chunks arriving: the message re-renders with a longer code block each
    // time, and the block is not tokenized again for any of them.
    for (let index = 1; index <= 10; index += 1) {
      await act(async () => {
        rerender(
          <MarkdownMessage
            text={messageWithChunk('streaming', `// ${String(index)}`)}
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
    <MarkdownMessage text={messageWithChunk('finishing', '// 0')} isStreaming />,
  );
  await act(async () => {});

  rerender(<MarkdownMessage text={messageWithChunk('finishing', '// 1')} isStreaming={false} />);
  await act(async () => {});
  // No interval to wait for once the message is whole: the reader is not left
  // looking at a plain tail.
  expect(highlighter.codeToTokens).toHaveBeenLastCalledWith(
    expect.stringContaining('// 1'),
    expect.anything(),
  );
});

test('highlights a block in a message that is not streaming', async () => {
  render(<MarkdownMessage text={messageWithChunk('whole', '// 0')} />);
  await act(async () => {});
  expect(highlighter.codeToTokens).toHaveBeenCalledTimes(1);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
