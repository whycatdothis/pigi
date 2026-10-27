/**
 * Shiki theme loading for the code blocks.
 *
 * The base theme follows the luminance of the app background, and every token
 * color is retinted to clear 3:1 against the code surface (`--muted`). Themes
 * are cached per (base theme, surface) pair; each one is registered under a
 * unique name so two surfaces can coexist in the same highlighter.
 */
import { bundledThemes, type Highlighter, type ThemeRegistration } from 'shiki/bundle/full';
import {
  CODE_TOKEN_CONTRAST_TARGET,
  codeThemeForBackground,
  quantizeSurface,
  retintTokenColors,
} from '../../../../shared/codeTheme';

export interface CodeTheme {
  /** Name registered with the highlighter and used as part of the cache key. */
  name: string;
  registration: ThemeRegistration;
}

/** Themes the code blocks can be showing at once is one or two; this is slack. */
const MAX_THEME_CACHE_SIZE = 16;

const themeCache = new Map<string, Promise<CodeTheme>>();

function shortHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

/** The registered theme name for a preset, background and code surface. */
export function codeThemeNameFor(background: string, surface: string, themeId: string): string {
  const base = codeThemeForBackground(background, themeId);
  return `pigi-${base}-${shortHash(`${base}|${quantizeSurface(surface)}`)}`;
}

/** Loads (and retints) the theme for a background and code surface. */
export async function loadCodeTheme(
  background: string,
  surface: string,
  themeId: string,
): Promise<CodeTheme> {
  const base = codeThemeForBackground(background, themeId);
  const quantized = quantizeSurface(surface);
  const cacheKey = `${base}|${quantized}`;
  const existing = themeCache.get(cacheKey);
  if (existing) {
    // Refresh the insertion order so the eviction below keeps hot themes.
    themeCache.delete(cacheKey);
    themeCache.set(cacheKey, existing);
    return existing;
  }

  const loading = (async (): Promise<CodeTheme> => {
    const themeModule = await bundledThemes[base]();
    const raw = themeModule.default;
    const name = codeThemeNameFor(background, surface, themeId);
    const registration: ThemeRegistration = {
      ...raw,
      name,
      tokenColors: retintTokenColors(raw.tokenColors, quantized, CODE_TOKEN_CONTRAST_TARGET),
    };
    return { name, registration };
  })();

  themeCache.set(cacheKey, loading);
  if (themeCache.size > MAX_THEME_CACHE_SIZE) {
    const oldest = themeCache.keys().next();
    if (!oldest.done) {
      themeCache.delete(oldest.value);
    }
  }
  return loading;
}

/** Registers the theme in the shared highlighter, once per name. */
export async function ensureThemeLoaded(
  highlighter: Highlighter,
  theme: CodeTheme,
  loadedThemes: Set<string>,
): Promise<void> {
  if (loadedThemes.has(theme.name)) {
    return;
  }
  await highlighter.loadTheme(theme.registration);
  loadedThemes.add(theme.name);
}
