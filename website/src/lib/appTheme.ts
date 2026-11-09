/**
 * The app's colours, derived by the app's own code.
 *
 * The app never paints with the fallbacks in `designTokens.css`: on launch it
 * runs `deriveTokens` (`src/shared/appearanceTokens.ts`) over the user's
 * appearance and writes every `--app-*` property onto `<html>`. That is where
 * the accent-filled send button, the tinted sidebar selection and the solved
 * secondary text come from, so the page runs the same function instead of
 * approximating its output.
 *
 * `defaultThemeCss` is the build-time half: the look the page opens in, for
 * both modes, so nothing flashes. `themeTokens` is the same call at run time,
 * which is how the Appearance still re-skins the page when a reader picks a
 * theme or an accent there.
 */
import {
  ACCENT_PRESETS,
  DEFAULT_MODE_APPEARANCE,
  type AccentChoice,
  type ColorMode,
} from '../../../src/shared/appearance';
import {
  DEFAULT_MODE_COLORS,
  deriveTokens,
  resolvedSecondaryContrast,
  type ResolvedAppearance,
} from '../../../src/shared/appearanceTokens';
import { formatHex, parseCssColor } from '../../../src/shared/colorMath';
import {
  THEME_PRESETS,
  accentSwatchHex,
  matchThemePreset,
  type ThemePreset,
} from '../../../src/shared/themePresets';

export { ACCENT_PRESETS, THEME_PRESETS };

/**
 * The look the page opens in: the default `pigi` theme with the app's own Pink
 * accent, the one of the eight that is the pig's colour.
 */
export const SITE_ACCENT_ID = 'pink';

export interface ThemeChoice {
  /** A `THEME_PRESETS` id; its colours, and its accent unless `accent` is set. */
  themeId: string;
  /** An accent picked after the theme, which wins over the theme's own. */
  accent?: AccentChoice;
}

export const SITE_THEME: ThemeChoice = {
  themeId: THEME_PRESETS[0].id,
  accent: { presetId: SITE_ACCENT_ID },
};

function findTheme(id: string): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}

function resolve(choice: ThemeChoice, mode: ColorMode): ResolvedAppearance {
  const preset = findTheme(choice.themeId)[mode];
  return {
    mode,
    slot: {
      ...DEFAULT_MODE_APPEARANCE[mode],
      background: preset.background,
      foreground: preset.foreground,
      accent: choice.accent ?? preset.accent,
    },
    reduceMotion: false,
    fontSmoothing: true,
  };
}

/** Every `--app-*` property the app would write for this choice in this mode. */
export function themeTokens(choice: ThemeChoice, mode: ColorMode): Record<string, string> {
  return deriveTokens(resolve(choice, mode));
}

export interface AppearanceSummary {
  /** The theme menu's label: the preset the colours match, or Custom. */
  themeName: string;
  badgeHex: string;
  /** The accent swatch that is pressed, `custom` for a hex accent. */
  accentId: string;
  /** A theme with its own dark palette turns separate modes on. */
  separate: boolean;
  background: string;
  foreground: string;
  /** The contrast slider's readout, `30 · 4.7:1`. */
  contrast: string;
}

function hex(value: string): string {
  const color = parseCssColor(value);
  return color ? formatHex(color) : value;
}

/**
 * What the Appearance page shows for a choice, the way the app reads it back
 * from the stored slot: with separate modes off it edits the light slot whatever
 * mode the window is in, but a colour left unset shows the default of the mode
 * on screen, which is the one it resolves to.
 */
export function appearanceSummary(choice: ThemeChoice, mode: ColorMode): AppearanceSummary {
  const theme = findTheme(choice.themeId);
  const separate = JSON.stringify(theme.light) !== JSON.stringify(theme.dark);
  const edited = separate ? mode : 'light';
  const resolved = resolve(choice, edited);
  const { accent, background, foreground, contrast } = resolved.slot;
  const matched = matchThemePreset({ background, foreground, accent }, edited);
  return {
    themeName: matched?.name ?? 'Custom',
    badgeHex: accentSwatchHex(matched ? matched.light.accent : accent),
    accentId: 'presetId' in accent ? accent.presetId : 'custom',
    separate,
    background: hex(background ?? DEFAULT_MODE_COLORS[mode].background),
    foreground: hex(foreground ?? DEFAULT_MODE_COLORS[mode].foreground),
    contrast: `${contrast} · ${resolvedSecondaryContrast(resolved).toFixed(1)}:1`,
  };
}

const PREVIEW_TOKENS = {
  background: '--app-background',
  foreground: '--app-foreground',
  card: '--app-card',
  muted: '--app-muted-foreground',
  accent: '--app-system-accent',
  border: '--app-border',
} as const;

/** The Mode previews' `--preview-{mode}-{role}` properties, both modes of a choice. */
export function previewProperties(choice: ThemeChoice): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as const) {
    const tokens = themeTokens(choice, mode);
    for (const [role, token] of Object.entries(PREVIEW_TOKENS)) {
      properties[`--preview-${mode}-${role}`] = tokens[token];
    }
  }
  return properties;
}

function declarations(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

/** `:root` and `.dark`, the same two selectors the fallbacks they override use. */
export function defaultThemeCss(): string {
  return [
    `:root{${declarations(themeTokens(SITE_THEME, 'light'))}}`,
    `.dark{${declarations(themeTokens(SITE_THEME, 'dark'))}}`,
  ].join('\n');
}
