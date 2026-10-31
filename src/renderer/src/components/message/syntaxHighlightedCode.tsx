import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  bundledLanguages,
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from 'shiki/bundle/full';
import { appearanceTokensFor } from '../../appearance/appearanceTokensCache';
import { useResolvedAppearance } from '../../appearance/useResolvedAppearance';
import { codeThemeNameFor, ensureThemeLoaded, loadCodeTheme } from './shikiThemes';
import { useSettingsStore } from '../../state/settingsStore';

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
  /** Longest code string to tokenize; larger inputs stay plain. */
  maxHighlightLength?: number;
  /** Most lines to tokenize; dense files can be short in characters and huge in spans. */
  maxHighlightLines?: number;
}

interface HighlightedToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

type HighlightedLine = HighlightedToken[];

interface HighlightedState {
  key: string;
  /** The exact code string these lines were highlighted from. */
  source: string;
  lines: HighlightedLine[] | null;
}

// Chat code blocks are usually small; a larger block is more likely to be
// generated and not worth blocking the renderer for. The file viewer opts into
// a higher limit for real source files.
const MAX_HIGHLIGHTED_CODE_LENGTH = 80_000;
const MAX_HIGHLIGHT_CACHE_SIZE = 100;
const MAX_TOKENIZED_LINE_LENGTH = 2_000;
const STREAMING_HIGHLIGHT_THROTTLE_MS = 60;
const TOKENIZE_TIME_LIMIT_MS = 250;
const HIGHLIGHT_STATE_KEY_SEPARATOR = ':';
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;
const FONT_STYLE_STRIKETHROUGH = 8;

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLanguages = new Set<BundledLanguage>();
const loadedThemes = new Set<string>();
const highlightedCodeCache = new Map<string, Promise<HighlightedLine[] | null>>();

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    // Themes are registered on demand, once the appearance says which ones the
    // code surface needs.
    highlighterPromise = createHighlighter({
      themes: [],
      langs: [],
    });
  }

  return highlighterPromise;
}

function isBundledLanguage(language: string): language is BundledLanguage {
  return Object.prototype.hasOwnProperty.call(bundledLanguages, language);
}

function normalizeLanguage(language: string): BundledLanguage | null {
  const normalized = language.trim().toLowerCase();
  if (!normalized || !isBundledLanguage(normalized)) {
    return null;
  }
  return normalized;
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

function tokenStyle(token: HighlightedToken): CSSProperties {
  const style: CSSProperties = {};
  if (token.color) {
    style.color = token.color;
  }
  if (token.fontStyle !== undefined) {
    if (token.fontStyle & FONT_STYLE_ITALIC) {
      style.fontStyle = 'italic';
    }
    if (token.fontStyle & FONT_STYLE_BOLD) {
      style.fontWeight = 600;
    }
    const decorations: string[] = [];
    if (token.fontStyle & FONT_STYLE_UNDERLINE) {
      decorations.push('underline');
    }
    if (token.fontStyle & FONT_STYLE_STRIKETHROUGH) {
      decorations.push('line-through');
    }
    if (decorations.length > 0) {
      style.textDecoration = decorations.join(' ');
    }
  }
  return style;
}

function cacheKey(
  code: string,
  language: BundledLanguage,
  themeName: string,
  maxHighlightLength: number,
  maxHighlightLines: number,
): string {
  return `${maxHighlightLength}\n${maxHighlightLines}\n${themeName}\n${language}\n${code}`;
}

function countLines(code: string): number {
  let lines = 1;
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '\n') lines += 1;
  }
  return lines;
}

function highlightedStateKey(code: string, language: BundledLanguage, themeName: string): string {
  return [themeName, language, code.length, hashString(code)].join(HIGHLIGHT_STATE_KEY_SEPARATOR);
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function cacheHighlightedCode(
  code: string,
  language: BundledLanguage,
  themeName: string,
  background: string,
  surface: string,
  codeThemeId: string,
  maxHighlightLength: number,
  maxHighlightLines: number,
): Promise<HighlightedLine[] | null> {
  const key = cacheKey(code, language, themeName, maxHighlightLength, maxHighlightLines);
  const cached = highlightedCodeCache.get(key);
  if (cached) {
    return cached;
  }

  const highlighted = highlightCode(
    code,
    language,
    themeName,
    background,
    surface,
    codeThemeId,
    maxHighlightLength,
    maxHighlightLines,
  );
  highlightedCodeCache.set(key, highlighted);
  if (highlightedCodeCache.size > MAX_HIGHLIGHT_CACHE_SIZE) {
    const oldestKey = highlightedCodeCache.keys().next().value;
    if (oldestKey) {
      highlightedCodeCache.delete(oldestKey);
    }
  }
  return highlighted;
}

async function highlightCode(
  code: string,
  language: BundledLanguage,
  themeName: string,
  background: string,
  surface: string,
  codeThemeId: string,
  maxHighlightLength: number,
  maxHighlightLines: number,
): Promise<HighlightedLine[] | null> {
  if (code.length > maxHighlightLength || countLines(code) > maxHighlightLines) {
    return null;
  }

  const highlighter = await getHighlighter();
  const theme = await loadCodeTheme(background, surface, codeThemeId);
  await ensureThemeLoaded(highlighter, theme, loadedThemes);
  if (!loadedLanguages.has(language)) {
    await highlighter.loadLanguage(language);
    loadedLanguages.add(language);
  }

  const result = highlighter.codeToTokens(code, {
    lang: language,
    theme: themeName,
    tokenizeMaxLineLength: MAX_TOKENIZED_LINE_LENGTH,
    tokenizeTimeLimit: TOKENIZE_TIME_LIMIT_MS,
  });

  return result.tokens.map((line) =>
    line.map((token) => ({
      content: token.content,
      color: token.color,
      fontStyle: token.fontStyle,
    })),
  );
}

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
  maxHighlightLength = MAX_HIGHLIGHTED_CODE_LENGTH,
  maxHighlightLines = Number.POSITIVE_INFINITY,
}: SyntaxHighlightedCodeProps): React.JSX.Element {
  const resolvedAppearance = useResolvedAppearance();
  const codeThemeId = useSettingsStore((state) => state.appearance.codeTheme);
  // The code block sits on --muted, so that is the surface the tokens have to
  // clear; the app background decides which base theme fits.
  const codeTheme = useMemo(() => {
    const tokens = appearanceTokensFor(resolvedAppearance);
    const background = tokens['--app-background'];
    const surface = tokens['--app-muted'];
    return {
      background,
      surface,
      name: codeThemeNameFor(background, surface, codeThemeId),
    };
  }, [resolvedAppearance, codeThemeId]);
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const highlightInput = useStreamingThrottledCode(
    code,
    isStreaming,
    STREAMING_HIGHLIGHT_THROTTLE_MS,
  );
  const currentHighlightKey = useMemo(
    () =>
      normalizedLanguage
        ? highlightedStateKey(highlightInput, normalizedLanguage, codeTheme.name)
        : null,
    [highlightInput, normalizedLanguage, codeTheme.name],
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

    if (!normalizedLanguage || !currentHighlightKey) {
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
      maxHighlightLength,
      maxHighlightLines,
    )
      .then((lines) => {
        if (!cancelled) {
          setHighlightedState({ key: currentHighlightKey, source: highlightInput, lines });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedState({ key: currentHighlightKey, source: highlightInput, lines: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    highlightInput,
    currentHighlightKey,
    normalizedLanguage,
    codeTheme,
    codeThemeId,
    maxHighlightLength,
    maxHighlightLines,
  ]);

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
