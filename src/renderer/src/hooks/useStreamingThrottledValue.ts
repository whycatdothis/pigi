import { useEffect, useRef, useState } from 'react';

/** A markdown parse is linear in its length, measured 41ms at 148KB. */
const STREAMING_MARKDOWN_MIN_INTERVAL_MS = 80;
const STREAMING_MARKDOWN_MAX_INTERVAL_MS = 400;
const STREAMING_MARKDOWN_CHARS_PER_MS = 400;

/**
 * Trailing throttle for a value that grows while an answer streams: work that
 * is expensive in the value's length (markdown parse, syntax highlight) runs at
 * most once per interval. The live value is returned as soon as streaming
 * stops, so the last frame is never stale.
 */
export function useStreamingThrottledValue<T>(
  value: T,
  isStreaming: boolean,
  intervalMs: number,
): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const latestValueRef = useRef(value);
  const lastEmitAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestValueRef.current = value;
    if (!isStreaming) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    // Coalesce bursts into at most one emit per interval. setState runs only
    // inside the timer (async), never synchronously here.
    if (timerRef.current === null) {
      const wait = Math.max(0, intervalMs - (Date.now() - lastEmitAtRef.current));
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastEmitAtRef.current = Date.now();
        setThrottledValue(latestValueRef.current);
      }, wait);
    }
  }, [value, isStreaming, intervalMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return isStreaming ? throttledValue : value;
}

/**
 * The throttle for a streaming message's markdown, sized from the text it has
 * to parse: at 150KB the parse alone is 41ms, and running it on every 16ms
 * render is what makes a long answer stutter. Proportional intervals keep the
 * parse to a fixed share of the frame budget instead.
 */
export function streamingMarkdownIntervalMs(length: number): number {
  return Math.min(
    STREAMING_MARKDOWN_MAX_INTERVAL_MS,
    Math.max(
      STREAMING_MARKDOWN_MIN_INTERVAL_MS,
      Math.round(length / STREAMING_MARKDOWN_CHARS_PER_MS),
    ),
  );
}
