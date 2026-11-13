/**
 * Shiki highlighting shared by the code blocks, the file viewer and the diff
 * viewer: one highlighter, one token cache and one size budget.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  bundledLanguages,
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from 'shiki/bundle/full';
import { appearanceTokensFor } from '../../appearance/appearanceTokensCache';
import { useResolvedAppearance } from '../../appearance/useResolvedAppearance';
import { useSettingsStore } from '../../state/settingsStore';
import { codeThemeNameFor, ensureThemeLoaded, loadCodeTheme } from './shikiThemes';

interface HighlightedToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export type HighlightedLine = HighlightedToken[];

export interface HighlightedState {
  /** The exact code string these lines were highlighted from. */
  source: string;
  lines: HighlightedLine[] | null;
}

// Chat, the file viewer and the diff viewer share one budget: 90k characters
// covers the largest file the app opens, and 2,500 lines bounds the span count
// when many short lines fit under the character cap. Sharing it keeps the cache
// key independent of the caller.
const MAX_HIGHLIGHTED_CODE_LENGTH = 90_000;
const MAX_HIGHLIGHTED_LINES = 2_500;
const MAX_HIGHLIGHT_CACHE_SIZE = 8;
const MAX_TOKENIZED_LINE_LENGTH = 2_000;
const TOKENIZE_TIME_LIMIT_MS = 250;
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

export function normalizeLanguage(language: string): BundledLanguage | null {
  const normalized = language.trim().toLowerCase();
  if (!normalized || !isBundledLanguage(normalized)) {
    return null;
  }
  return normalized;
}

export function tokenStyle(token: HighlightedToken): CSSProperties {
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

export function isWithinHighlightBudget(code: string): boolean {
  return code.length <= MAX_HIGHLIGHTED_CODE_LENGTH && countLines(code) <= MAX_HIGHLIGHTED_LINES;
}

function cacheKey(code: string, language: BundledLanguage, themeName: string): string {
  return `${themeName}\n${language}\n${code}`;
}

function countLines(code: string): number {
  if (code.length === 0) return 1;
  let lineBreaks = 0;
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '\n') lineBreaks += 1;
  }
  // A trailing newline terminates the last line; counting it as an empty line
  // would turn the 2,500-line gate into 2,499.
  return code.endsWith('\n') ? lineBreaks : lineBreaks + 1;
}

export function cacheHighlightedCode(
  code: string,
  language: BundledLanguage,
  themeName: string,
  background: string,
  surface: string,
  codeThemeId: string,
): Promise<HighlightedLine[] | null> {
  const key = cacheKey(code, language, themeName);
  const cached = highlightedCodeCache.get(key);
  if (cached) {
    return cached;
  }

  const highlighted = highlightCode(code, language, themeName, background, surface, codeThemeId);
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
): Promise<HighlightedLine[] | null> {
  if (!isWithinHighlightBudget(code)) {
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

export function useCodeTheme(): {
  background: string;
  surface: string;
  name: string;
  codeThemeId: string;
} {
  const resolvedAppearance = useResolvedAppearance();
  const codeThemeId = useSettingsStore((state) => state.appearance.codeTheme);
  // The code block sits on --muted, so that is the surface the tokens have to
  // clear; the app background decides which base theme fits.
  return useMemo(() => {
    const tokens = appearanceTokensFor(resolvedAppearance);
    const background = tokens['--app-background'];
    const surface = tokens['--app-muted'];
    return {
      background,
      surface,
      name: codeThemeNameFor(background, surface, codeThemeId),
      codeThemeId,
    };
  }, [resolvedAppearance, codeThemeId]);
}

/**
 * Token lines for a finished piece of code. While new code highlights, the
 * lines of the previous code stay (stale-while-revalidate); `settled` turns
 * true once any highlight has landed, or at once when there is nothing to
 * highlight. `lines` is null for an unknown language or code over the budget.
 */
export function useHighlightedLines(
  code: string,
  language: string,
): { lines: HighlightedLine[] | null; settled: boolean } {
  const codeTheme = useCodeTheme();
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const [highlightedState, setHighlightedState] = useState<HighlightedState | null>(null);

  useEffect(() => {
    if (!normalizedLanguage) return;
    let cancelled = false;
    cacheHighlightedCode(
      code,
      normalizedLanguage,
      codeTheme.name,
      codeTheme.background,
      codeTheme.surface,
      codeTheme.codeThemeId,
    )
      .then((lines) => {
        if (!cancelled) setHighlightedState({ source: code, lines });
      })
      .catch(() => {
        if (!cancelled) setHighlightedState({ source: code, lines: null });
      });
    return () => {
      cancelled = true;
    };
  }, [code, normalizedLanguage, codeTheme]);

  if (!normalizedLanguage) return { lines: null, settled: true };
  return { lines: highlightedState?.lines ?? null, settled: highlightedState !== null };
}
