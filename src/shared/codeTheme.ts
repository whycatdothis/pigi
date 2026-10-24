/**
 * Code-block theming: which base theme to use, and how to keep its token colors
 * readable against the actual code surface.
 *
 * Shiki's own background is never used — the code block sits on the `--muted`
 * token — so the base theme is chosen from the measured luminance of the app
 * background, and each token color is pushed to a 3:1 floor against the surface
 * it will be painted on.
 */

export type CodeThemeName = 'one-light' | 'one-dark-pro';

/** WCAG 1.4.11 rate for large text and graphics: what code tokens count as. */
export const CODE_TOKEN_CONTRAST_TARGET = 3;

/** Above this relative luminance the surface is light enough for one-light. */
const LIGHT_SURFACE_LUMINANCE = 0.2;

import { ensureContrast, formatHex, parseCssColor, relativeLuminance } from './colorMath';

/** The subset of Shiki's `IRawThemeSetting` this pass reads and writes. */
export interface CodeThemeTokenColor {
  name?: string;
  scope?: string | string[];
  settings: { fontStyle?: string; foreground?: string; background?: string };
}

export function codeThemeForBackground(background: string): CodeThemeName {
  const parsed = parseCssColor(background);
  if (!parsed) {
    return 'one-light';
  }
  return relativeLuminance(parsed) >= LIGHT_SURFACE_LUMINANCE ? 'one-light' : 'one-dark-pro';
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
