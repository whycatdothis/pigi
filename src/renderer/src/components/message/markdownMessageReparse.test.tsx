// @vitest-environment jsdom
/**
 * react-markdown parses inside its own render, so throttling the string it is
 * given only helps if the element is not recreated for every batch: a render
 * with unchanged text must not pay for a parse. The parser is a counter here,
 * because the count is the thing this file is about.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import MarkdownMessage from './markdownMessage';

const parses = vi.hoisted(() => ({ count: 0 }));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => {
    parses.count += 1;
    return <div data-testid="parsed">{children}</div>;
  },
}));

afterEach(() => {
  cleanup();
  parses.count = 0;
  vi.useRealTimers();
});

/** One batch's worth of new text, drawn as the transcript would draw it. */
function draw(text: string, isStreaming = true): ReturnType<typeof render>['rerender'] {
  const view = render(<MarkdownMessage text={text} isStreaming={isStreaming} />);
  return view.rerender;
}

test('parses once per interval, not once per batch', () => {
  vi.useFakeTimers();
  const rerender = draw('Hello');
  expect(parses.count).toBe(1);

  // Two batches landing inside one interval: the drawn text stands still, so
  // the memoized element is reused and the parser is not entered again.
  act(() => {
    rerender(<MarkdownMessage text="Hello wor" isStreaming />);
  });
  act(() => {
    rerender(<MarkdownMessage text="Hello world" isStreaming />);
  });
  expect(parses.count).toBe(1);

  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(parses.count).toBe(2);
  expect(document.querySelector('[data-testid="parsed"]')?.textContent).toBe('Hello world');
});

test('parses the live text once streaming stops, even inside an interval', () => {
  vi.useFakeTimers();
  const rerender = draw('Hello');
  act(() => {
    rerender(<MarkdownMessage text="Hello world again" isStreaming />);
  });
  expect(parses.count).toBe(1);

  act(() => {
    rerender(<MarkdownMessage text="Hello world again" isStreaming={false} />);
  });
  expect(parses.count).toBe(2);
  expect(document.querySelector('[data-testid="parsed"]')?.textContent).toBe('Hello world again');
});
