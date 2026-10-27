import type { BundledTheme } from 'shiki/bundle/full';
import {
  ensureContrast,
  formatHex,
  oklchToRgb,
  parseCssColor,
  relativeLuminance,
  rgbToHex,
} from './colorMath';

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
  { id: 'ayu', name: 'Ayu', light: 'ayu-light', dark: 'ayu-dark' },
  { id: 'catppuccin', name: 'Catppuccin', light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
  { id: 'everforest', name: 'Everforest', light: 'everforest-light', dark: 'everforest-dark' },
  { id: 'github', name: 'GitHub', light: 'github-light', dark: 'github-dark' },
  { id: 'gruvbox', name: 'Gruvbox', light: 'gruvbox-light-medium', dark: 'gruvbox-dark-medium' },
  { id: 'horizon', name: 'Horizon', light: 'horizon-bright', dark: 'horizon' },
  { id: 'kanagawa', name: 'Kanagawa', light: 'kanagawa-lotus', dark: 'kanagawa-wave' },
  {
    id: 'material',
    name: 'Material',
    light: 'material-theme-lighter',
    dark: 'material-theme-darker',
  },
  { id: 'min', name: 'Min', light: 'min-light', dark: 'min-dark' },
  { id: 'night-owl', name: 'Night Owl', light: 'night-owl-light', dark: 'night-owl' },
  { id: 'nord', name: 'Nord', light: 'nord', dark: 'nord' },
  { id: 'one', name: 'One', light: 'one-light', dark: 'one-dark-pro' },
  { id: 'plus', name: 'Plus', light: 'light-plus', dark: 'dark-plus' },
  { id: 'rose-pine', name: 'Rosé Pine', light: 'rose-pine-dawn', dark: 'rose-pine' },
  { id: 'rose-pine-moon', name: 'Rosé Pine Moon', light: 'rose-pine-dawn', dark: 'rose-pine-moon' },
  { id: 'slack', name: 'Slack', light: 'slack-ochin', dark: 'slack-dark' },
  { id: 'solarized', name: 'Solarized', light: 'solarized-light', dark: 'solarized-dark' },
  { id: 'vitesse', name: 'Vitesse', light: 'vitesse-light', dark: 'vitesse-dark' },
];

export const DEFAULT_CODE_THEME_ID = 'one';

export function isCodeThemeId(value: unknown): value is string {
  return typeof value === 'string' && CODE_THEME_PRESETS.some((preset) => preset.id === value);
}

const FALLBACK_PRESET =
  CODE_THEME_PRESETS.find((preset) => preset.id === DEFAULT_CODE_THEME_ID) ?? CODE_THEME_PRESETS[0];

export function codeThemePresetFor(id: string): CodeThemePreset {
  return CODE_THEME_PRESETS.find((preset) => preset.id === id) ?? FALLBACK_PRESET;
}

/** WCAG 1.4.11 rate for large text and graphics: what code tokens count as. */
export const CODE_TOKEN_CONTRAST_TARGET = 3;

/**
 * Rounds a surface to a coarse grid so a colour picker being dragged does not
 * mint a theme per frame.
 *
 * Every step of the drag would otherwise retint and register a whole Shiki theme
 * under a new name, and neither the theme cache nor the highlighter's registry
 * can give that memory back. Four levels per channel is under 1% of luminance,
 * well inside the rounding of the 3:1 floor, and it turns a continuous drag into
 * a handful of distinct surfaces.
 */
const SURFACE_QUANTUM = 4;

export function quantizeSurface(surface: string): string {
  const parsed = parseCssColor(surface);
  if (!parsed) {
    return surface;
  }
  const rgb = oklchToRgb(parsed);
  const step = (value: number): number => Math.round(value / SURFACE_QUANTUM) * SURFACE_QUANTUM;
  return rgbToHex({ red: step(rgb.red), green: step(rgb.green), blue: step(rgb.blue) });
}

/** Above this relative luminance the surface is light enough for one-light. */
const LIGHT_SURFACE_LUMINANCE = 0.2;

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
