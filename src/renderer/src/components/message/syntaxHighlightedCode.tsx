import { memo, useEffect, useMemo, useState } from 'react';
import {
  cacheHighlightedCode,
  normalizeLanguage,
  tokenStyle,
  useCodeTheme,
  type HighlightedState,
} from './codeHighlighting';
import { useStreamingThrottledValue } from '../../hooks/useStreamingThrottledValue';
import type { LineRange } from '../../lib/filePathCandidates';

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
  /**
   * The file line the first line drawn is, for a block that quotes part of a
   * file: the gutter counts from there and `data-source-line` names the line in
   * the file rather than the line in the block.
   */
  firstLineNumber?: number;
  /** The surface behind the gutter, which sticky cells have to cover as code scrolls under them. */
  gutterClassName?: string;
  /** Makes each gutter number open that line in the file, when the block names one. */
  onOpenLine?: (lineNumber: number) => void;
  /** Lines to highlight, with `lineNumbers`: the range a chat link opened. */
  markedLines?: LineRange | null;
}

function isMarked(lineNumber: number, markedLines: LineRange | null | undefined): boolean {
  return !!markedLines && lineNumber >= markedLines.start && lineNumber <= markedLines.end;
}

/** How the gutter is drawn: where its numbers start, its surface, and what a click does. */
interface GutterOptions {
  /** The file line the block's first line is, so numbers name lines in the file. */
  firstLineNumber: number;
  markedLines: LineRange | null | undefined;
  /** The surface behind the gutter, which the code scrolls under. */
  className: string;
  /** Opens that line in the file; without it the numbers are labels. */
  onOpenLine?: (lineNumber: number) => void;
}

// The gutter is opaque so code scrolled under it stays hidden; a marked line's
// gutter mixes the same tint the row gets from its translucent background.
const MARKED_LINE_CLASS = 'bg-[var(--system-accent)]/10';
const MARKED_GUTTER_CLASS =
  'bg-[color-mix(in_srgb,var(--system-accent)_10%,var(--background))] text-[var(--system-accent)]';

function codeLineClassName(lineNumbers: boolean, marked = false): string {
  // Line rows keep content-visibility off: with the w-max rows and sticky
  // gutter it showed no reliable gain, and the cost is dominated by line count.
  // Every line, empty or not and drawn or skipped, is one line box tall, as in
  // the plain text the highlight replaces: 20px against a 22.4px line made a
  // streamed block shrink when its highlight landed, jolting a followed reply.
  if (!lineNumbers) {
    return 'block min-h-[1lh] [content-visibility:auto] [contain-intrinsic-size:auto_1lh]';
  }
  const row = 'flex min-h-5 min-w-full w-max leading-5';
  return marked ? `${row} ${MARKED_LINE_CLASS}` : row;
}

function codeClassName(lineNumbers: boolean): string {
  return `block min-w-full w-max bg-transparent p-0 font-mono text-code${lineNumbers ? ' leading-5' : ''}`;
}

/** A sticky gutter cell, so horizontal scrolling never hides the line numbers. */
function SourceLineNumber({
  lineNumber,
  marked,
  gutter,
}: {
  lineNumber: number;
  marked: boolean;
  gutter: GutterOptions;
}): React.JSX.Element {
  // `select-none` is what keeps the number out of a quote: a selection now
  // carries its text, so a selectable gutter would send `12const a = 1;`.
  const className = `sticky left-0 z-10 flex w-14 shrink-0 select-none items-center justify-end self-stretch pr-3 text-right tabular-nums ${marked ? MARKED_GUTTER_CLASS : `${gutter.className} text-muted-foreground`}`;
  if (!gutter.onOpenLine) {
    return (
      <span aria-hidden="true" data-search-ignore data-sticky-inset className={className}>
        {lineNumber}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-sticky-inset
      data-search-ignore
      // The title above the block opens it for the keyboard; these are the
      // pointer's shortcut, and a long block would otherwise put one tab stop
      // per line between the message and whatever follows it.
      tabIndex={-1}
      aria-label={`Open line ${lineNumber}`}
      title={`Open line ${lineNumber}`}
      onClick={() => gutter.onOpenLine?.(lineNumber)}
      className={`${className} cursor-pointer`}
    >
      {lineNumber}
    </button>
  );
}

function plainSourceLineNodes(code: string, gutter: GutterOptions): React.JSX.Element[] {
  return code.split('\n').map((line, lineIndex) => {
    const lineNumber = gutter.firstLineNumber + lineIndex;
    const marked = isMarked(lineNumber, gutter.markedLines);
    return (
      <span
        key={lineIndex}
        data-source-line={lineNumber}
        className={codeLineClassName(true, marked)}
      >
        <SourceLineNumber lineNumber={lineNumber} marked={marked} gutter={gutter} />
        <span className="min-w-0 whitespace-pre">{line}</span>
      </span>
    );
  });
}

// The plain fallback can be 5,000 rows. Memoizing the built elements keeps a
// re-render (theme, parent state) from rebuilding the whole list, while still
// doing no work on the highlighted path.
const PlainSourceLines = memo(function PlainSourceLines({
  code,
  gutter,
}: {
  code: string;
  gutter: GutterOptions;
}): React.JSX.Element {
  return <>{plainSourceLineNodes(code, gutter)}</>;
});

export default function SyntaxHighlightedCode({
  code,
  language,
  isStreaming = false,
  lineNumbers = false,
  firstLineNumber = 1,
  gutterClassName = 'bg-background',
  onOpenLine,
  markedLines,
}: SyntaxHighlightedCodeProps): React.JSX.Element {
  const codeTheme = useCodeTheme();
  const { codeThemeId } = codeTheme;
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const gutter = useMemo<GutterOptions>(
    () => ({ firstLineNumber, markedLines, className: gutterClassName, onOpenLine }),
    [firstLineNumber, markedLines, gutterClassName, onOpenLine],
  );
  const highlightInput = useStreamingThrottledValue(
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
      const marked =
        lineNumbers && isMarked(gutter.firstLineNumber + lineIndex, gutter.markedLines);
      return (
        <span
          key={lineIndex}
          data-source-line={lineNumbers ? gutter.firstLineNumber + lineIndex : undefined}
          // Skip layout/paint/raster for lines clipped by the clamp or scrolled
          // out of view; they render lazily when revealed.
          className={codeLineClassName(lineNumbers, marked)}
        >
          {lineNumbers && (
            <SourceLineNumber
              lineNumber={gutter.firstLineNumber + lineIndex}
              marked={marked}
              gutter={gutter}
            />
          )}
          {lineNumbers ? <span className="min-w-0 whitespace-pre">{tokens}</span> : tokens}
        </span>
      );
    });
  }, [highlightedLines, isAppendOfSource, lineNumbers, gutter]);

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
        {lineNumbers ? <PlainSourceLines code={code} gutter={gutter} /> : code}
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
        {lineNumbers ? <PlainSourceLines code={code} gutter={gutter} /> : code}
      </code>
    );
  }

  // A line-numbered block draws the tail as rows of its own, so the gutter
  // stays unbroken while the block arrives. The tail starts at the last
  // highlighted line (or the line after it, when that line ended the source),
  // so its numbers continue the highlight rather than jump to the block's end.
  const tailFirstLineNumber = gutter.firstLineNumber + highlightedSource.split('\n').length - 1;
  return (
    <code className={codeClassName(lineNumbers)}>
      {highlightedLineNodes}
      {plainTail !== '' &&
        (lineNumbers ? (
          plainTail.split('\n').map((line, index) => {
            const lineNumber = tailFirstLineNumber + index;
            const marked = isMarked(lineNumber, gutter.markedLines);
            return (
              <span
                key={`tail-${index}`}
                data-source-line={lineNumber}
                className={codeLineClassName(true, marked)}
              >
                <SourceLineNumber lineNumber={lineNumber} marked={marked} gutter={gutter} />
                <span className="min-w-0 whitespace-pre">{line}</span>
              </span>
            );
          })
        ) : (
          <span className="block whitespace-pre-wrap">{plainTail}</span>
        ))}
    </code>
  );
}
