import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  cacheHighlightedCode,
  normalizeLanguage,
  tokenStyle,
  useCodeTheme,
  type HighlightedState,
} from './codeHighlighting';

const STREAMING_HIGHLIGHT_THROTTLE_MS = 60;

interface SyntaxHighlightedCodeProps {
  code: string;
  language: string;
  /**
   * When true, the code is still streaming in. Highlighting is throttled so
   * shiki re-tokenizes at most once per {@link STREAMING_HIGHLIGHT_THROTTLE_MS}
   * instead of on every chunk.
   */
  isStreaming?: boolean;
  /**
   * Draw a line-number column (file viewer). Each line also carries
   * `data-source-line`, which is how a text selection maps back to source
   * lines for a quote.
   */
  lineNumbers?: boolean;
}

function codeLineClassName(lineNumbers: boolean): string {
  // Line rows keep content-visibility off: with the w-max rows and sticky
  // gutter it showed no reliable gain, and the cost is dominated by line count.
  return lineNumbers
    ? 'flex min-h-5 min-w-full w-max leading-5'
    : 'block min-h-5 [content-visibility:auto] [contain-intrinsic-size:auto_20px]';
}

function codeClassName(lineNumbers: boolean): string {
  return `block min-w-full w-max bg-transparent p-0 font-mono text-code${lineNumbers ? ' leading-5' : ''}`;
}

/** A sticky gutter cell, so horizontal scrolling never hides the line numbers. */
function SourceLineNumber({ lineNumber }: { lineNumber: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="sticky left-0 z-10 w-14 shrink-0 select-none bg-background pr-3 text-right text-muted-foreground tabular-nums"
    >
      {lineNumber}
    </span>
  );
}

function plainSourceLineNodes(code: string): React.JSX.Element[] {
  return code.split('\n').map((line, lineIndex) => (
    <span key={lineIndex} data-source-line={lineIndex + 1} className={codeLineClassName(true)}>
      <SourceLineNumber lineNumber={lineIndex + 1} />
      <span className="min-w-0 whitespace-pre">{line}</span>
    </span>
  ));
}

// The plain fallback can be 5,000 rows. Memoizing the built elements keeps a
// re-render (theme, parent state) from rebuilding the whole list, while still
// doing no work on the highlighted path.
const PlainSourceLines = memo(function PlainSourceLines({
  code,
}: {
  code: string;
}): React.JSX.Element {
  return <>{plainSourceLineNodes(code)}</>;
});

/**
 * Throttles code updates so a downstream (expensive) computation runs at most
 * once per interval while streaming. Passes the value through immediately when
 * not streaming, and flushes the latest value once streaming stops.
 */
function useStreamingThrottledCode(code: string, isStreaming: boolean, intervalMs: number): string {
  const [throttledCode, setThrottledCode] = useState(code);
  const latestCodeRef = useRef(code);
  const lastEmitAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Refs are written here (in an effect), never during render.
    latestCodeRef.current = code;
    if (!isStreaming) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    // Trailing throttle: coalesce bursts into at most one emit per interval.
    // setState runs only inside the timer (async), never synchronously here.
    if (timerRef.current === null) {
      const wait = Math.max(0, intervalMs - (Date.now() - lastEmitAtRef.current));
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastEmitAtRef.current = Date.now();
        setThrottledCode(latestCodeRef.current);
      }, wait);
    }
  }, [code, isStreaming, intervalMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  // While streaming, return the throttled value; otherwise pass the latest
  // through immediately so the final content highlights without delay.
  return isStreaming ? throttledCode : code;
}

export default function SyntaxHighlightedCode({
  code,
  language,
  isStreaming = false,
  lineNumbers = false,
}: SyntaxHighlightedCodeProps): React.JSX.Element {
  const codeTheme = useCodeTheme();
  const { codeThemeId } = codeTheme;
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const highlightInput = useStreamingThrottledCode(
    code,
    isStreaming,
    STREAMING_HIGHLIGHT_THROTTLE_MS,
  );
  const [highlightedState, setHighlightedState] = useState<HighlightedState | null>(null);
  // Stale-while-revalidate: keep the last successful highlight on screen while
  // the next one computes, so streaming updates never flash back to plain text.
  const highlightedLines = highlightedState?.lines ?? null;
  // The text the lines were highlighted from, and whether the live text has only
  // grown since: the last of those lines is drawn as plain text instead, because
  // the text may have run on inside it.
  const highlightedSource = highlightedState?.source ?? '';
  const isAppendOfSource =
    code.length > highlightedSource.length && code.startsWith(highlightedSource);

  // The lines of the highlight that is on screen. They are built only when a
  // highlight lands, and handed back unchanged for every render in between: a
  // block that is still arriving re-renders per chunk, and rebuilding (and
  // walking) every line of it on each of those renders is the whole cost of a
  // chunk. React leaves a subtree alone when it is given the same elements
  // again, so a chunk's work is the tail it appends rather than the block.
  const highlightedLineNodes = useMemo(() => {
    if (highlightedLines === null) return null;
    const lines = isAppendOfSource ? highlightedLines.slice(0, -1) : highlightedLines;
    return lines.map((line, lineIndex) => {
      const tokens = line.map((token, tokenIndex) => (
        <span key={tokenIndex} style={tokenStyle(token)}>
          {token.content}
        </span>
      ));
      return (
        <span
          key={lineIndex}
          data-source-line={lineNumbers ? lineIndex + 1 : undefined}
          // Skip layout/paint/raster for lines clipped by the clamp or scrolled
          // out of view; they render lazily when revealed.
          className={codeLineClassName(lineNumbers)}
        >
          {lineNumbers && <SourceLineNumber lineNumber={lineIndex + 1} />}
          {lineNumbers ? <span className="min-w-0 whitespace-pre">{tokens}</span> : tokens}
        </span>
      );
    });
  }, [highlightedLines, isAppendOfSource, lineNumbers]);

  useEffect(() => {
    let cancelled = false;

    if (!normalizedLanguage) {
      return () => {
        cancelled = true;
      };
    }

    void cacheHighlightedCode(
      highlightInput,
      normalizedLanguage,
      codeTheme.name,
      codeTheme.background,
      codeTheme.surface,
      codeThemeId,
    )
      .then((lines) => {
        if (!cancelled) {
          setHighlightedState({ source: highlightInput, lines });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedState({ source: highlightInput, lines: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [highlightInput, normalizedLanguage, codeTheme, codeThemeId]);

  if (!highlightedLines) {
    return (
      <code className={codeClassName(lineNumbers)}>
        {lineNumbers ? <PlainSourceLines code={code} /> : code}
      </code>
    );
  }

  // The stale highlight covers `highlightedSource`; anything the live `code` has
  // appended since then is drawn as a plain tail after it, so the latest content
  // is always visible. The tail gets highlighted on the next tick.
  let plainTail = '';
  if (isAppendOfSource) {
    plainTail = code.slice(highlightedSource.lastIndexOf('\n') + 1);
  } else if (code !== highlightedSource && !code.startsWith(highlightedSource)) {
    // Content diverged (not a simple append); avoid showing a mismatched
    // highlight and fall back to plain until the next highlight lands.
    return (
      <code className={codeClassName(lineNumbers)}>
        {lineNumbers ? <PlainSourceLines code={code} /> : code}
      </code>
    );
  }

  return (
    <code className={codeClassName(lineNumbers)}>
      {highlightedLineNodes}
      {plainTail !== '' && <span className="block whitespace-pre-wrap">{plainTail}</span>}
    </code>
  );
}
