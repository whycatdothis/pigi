/**
 * Code-block theming: which base theme to use, and how to keep its token colors
 * readable against the actual code surface.
 *
 * Shiki's own background is never used — the code block sits on the `--muted`
 * token — so the base theme is chosen from the measured luminance of the app
 * background, and each token color is pushed to a 3:1 floor against the surface
 * it will be painted on.
 */

/**
 * A code theme the reader can pick. Each preset carries a light and a dark
 * Shiki theme; which one is used follows the background the code sits on, not
 * the app's mode, so a custom light background in dark mode still gets the
 * readable half of the pair.
 */
export interface CodeThemePreset {
  id: string;
  name: string;
  /** Shiki theme for a light code surface. */
  light: BundledTheme;
  /** Shiki theme for a dark code surface. */
  dark: BundledTheme;
}

export const CODE_THEME_PRESETS: readonly CodeThemePreset[] = [
  { id: 'one', name: 'One', light: 'one-light', dark: 'one-dark-pro' },
  { id: 'github', name: 'GitHub', light: 'github-light', dark: 'github-dark' },
  { id: 'catppuccin', name: 'Catppuccin', light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
  { id: 'nord', name: 'Nord', light: 'nord', dark: 'nord' },
  { id: 'gruvbox', name: 'Gruvbox', light: 'gruvbox-light-medium', dark: 'gruvbox-dark-medium' },
  { id: 'solarized', name: 'Solarized', light: 'solarized-light', dark: 'solarized-dark' },
  { id: 'everforest', name: 'Everforest', light: 'everforest-light', dark: 'everforest-dark' },
  { id: 'rose-pine', name: 'Rosé Pine', light: 'rose-pine-dawn', dark: 'rose-pine' },
];

export const DEFAULT_CODE_THEME_ID = 'one';

export function isCodeThemeId(value: unknown): value is string {
  return typeof value === 'string' && CODE_THEME_PRESETS.some((preset) => preset.id === value);
}

export function codeThemePresetFor(id: string): CodeThemePreset {
  return CODE_THEME_PRESETS.find((preset) => preset.id === id) ?? CODE_THEME_PRESETS[0];
}

/** WCAG 1.4.11 rate for large text and graphics: what code tokens count as. */
export const CODE_TOKEN_CONTRAST_TARGET = 3;

/** Above this relative luminance the surface is light enough for one-light. */
const LIGHT_SURFACE_LUMINANCE = 0.2;

import type { BundledTheme } from 'shiki/bundle/full';
import { ensureContrast, formatHex, parseCssColor, relativeLuminance } from './colorMath';

/** The subset of Shiki's `IRawThemeSetting` this pass reads and writes. */
export interface CodeThemeTokenColor {
  name?: string;
  scope?: string | string[];
  settings: { fontStyle?: string; foreground?: string; background?: string };
}

/** The Shiki theme a given preset draws with on this background. */
export function codeThemeForBackground(background: string, themeId: string): BundledTheme {
  const preset = codeThemePresetFor(themeId);
  const parsed = parseCssColor(background);
  if (!parsed) {
    return preset.light;
  }
  return relativeLuminance(parsed) >= LIGHT_SURFACE_LUMINANCE ? preset.light : preset.dark;
}

/**
 * Returns token colors that clear `target` against `surface`, keeping hue and
 * chroma. Entries without a foreground are left alone; entries already above
 * the floor keep their exact value.
 */
export function retintTokenColors(
  entries: readonly CodeThemeTokenColor[] | undefined,
  surface: string,
  target: number = CODE_TOKEN_CONTRAST_TARGET,
): CodeThemeTokenColor[] | undefined {
  const reference = parseCssColor(surface);
  if (!entries || !reference) {
    return entries ? [...entries] : undefined;
  }
  return entries.map((entry) => {
    const foreground = entry.settings.foreground;
    if (!foreground) {
      return entry;
    }
    const parsed = parseCssColor(foreground);
    if (!parsed) {
      return entry;
    }
    return {
      ...entry,
      settings: {
        ...entry.settings,
        foreground: formatHex(ensureContrast(parsed, reference, target)),
      },
    };
  });
}
