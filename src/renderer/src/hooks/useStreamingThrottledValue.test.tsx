// @vitest-environment jsdom
/**
 * The contract of the streaming throttle: while a value streams it is emitted
 * at most once per interval, and the moment streaming stops the live value is
 * returned — the final frame must never be the throttled one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  useStreamingThrottledValue,
  streamingMarkdownIntervalMs,
} from './useStreamingThrottledValue';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function ValueProbe({
  value,
  isStreaming,
  intervalMs,
  onRender,
}: {
  value: string;
  isStreaming: boolean;
  intervalMs: number;
  onRender: (throttled: string) => void;
}): null {
  onRender(useStreamingThrottledValue(value, isStreaming, intervalMs));
  return null;
}

function renders(): string[] {
  return seen;
}

let seen: string[] = [];

function freshSeen(): void {
  seen = [];
}

describe('useStreamingThrottledValue', () => {
  it('passes the value through immediately when not streaming', () => {
    freshSeen();
    const { rerender } = render(
      <ValueProbe
        value="a"
        isStreaming={false}
        intervalMs={100}
        onRender={(value) => seen.push(value)}
      />,
    );
    rerender(
      <ValueProbe
        value="ab"
        isStreaming={false}
        intervalMs={100}
        onRender={(value) => seen.push(value)}
      />,
    );
    expect(renders().at(-1)).toBe('ab');
  });

  it('emits once per interval while streaming, with the latest value', () => {
    freshSeen();
    const { rerender } = render(
      <ValueProbe value="a" isStreaming intervalMs={100} onRender={(value) => seen.push(value)} />,
    );
    // The first frame is the initial value; the growing text waits for the timer.
    for (const value of ['ab', 'abc', 'abcd']) {
      rerender(
        <ValueProbe
          value={value}
          isStreaming
          intervalMs={100}
          onRender={(next) => seen.push(next)}
        />,
      );
    }
    expect(renders().at(-1)).toBe('a');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(renders().at(-1)).toBe('abcd');
    expect(renders().filter((value) => value === 'abcd')).toHaveLength(1);
  });

  it('returns the live value as soon as streaming stops', () => {
    freshSeen();
    const { rerender } = render(
      <ValueProbe value="a" isStreaming intervalMs={100} onRender={(value) => seen.push(value)} />,
    );
    rerender(
      <ValueProbe
        value="abc"
        isStreaming
        intervalMs={100}
        onRender={(value) => seen.push(value)}
      />,
    );
    // The pending emit is dropped, not applied late.
    rerender(
      <ValueProbe
        value="abcd"
        isStreaming={false}
        intervalMs={100}
        onRender={(value) => seen.push(value)}
      />,
    );
    expect(renders().at(-1)).toBe('abcd');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(renders().at(-1)).toBe('abcd');
  });
});

describe('streamingMarkdownIntervalMs', () => {
  it('grows with the text and stays inside the frame budget bounds', () => {
    expect(streamingMarkdownIntervalMs(0)).toBe(80);
    expect(streamingMarkdownIntervalMs(148_000)).toBe(370);
    expect(streamingMarkdownIntervalMs(10_000_000)).toBe(400);
    expect(streamingMarkdownIntervalMs(60_000)).toBeGreaterThan(
      streamingMarkdownIntervalMs(20_000),
    );
  });
});
