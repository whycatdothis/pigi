// The app never paints with the designTokens.css fallbacks; it writes
// deriveTokens' output onto <html>, so the page runs the same function.
import {
  ACCENT_PRESETS,
  DEFAULT_MODE_APPEARANCE,
  type AccentChoice,
  type ColorMode,
} from '../../../src/shared/appearance';
import type { OklchColor } from '../../../src/shared/colorMath';
import {
  DEFAULT_MODE_COLORS,
  deriveTokens,
  resolvedSecondaryContrast,
  type ResolvedAppearance,
} from '../../../src/shared/appearanceTokens';
import { formatHex, formatOklch, parseCssColor } from '../../../src/shared/colorMath';
import {
  THEME_PRESETS,
  accentSwatchHex,
  matchThemePreset,
  type ThemePreset,
} from '../../../src/shared/themePresets';

export { ACCENT_PRESETS, THEME_PRESETS };

export const SITE_ACCENT_ID = 'pink';

export interface ThemeChoice {
  themeId: string;
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

function oklch(value: string): OklchColor {
  const color = parseCssColor(value);
  if (!color) throw new Error(`deriveTokens wrote a colour this page cannot read: ${value}`);
  return color;
}

// Night needs about three times the chroma, or the hue drowns.
function pageTokens(tokens: Record<string, string>, mode: ColorMode): Record<string, string> {
  const background = oklch(tokens['--app-background']);
  const { hue } = oklch(tokens['--app-primary']);
  const page =
    mode === 'light'
      ? { lightness: background.lightness - 0.028, chroma: 0.011, hue }
      : { lightness: background.lightness + 0.01, chroma: 0.03, hue };
  return {
    '--brand': tokens['--app-primary'],
    '--brand-ink': tokens['--app-primary-foreground'],
    '--page-background': formatOklch(page),
  };
}

export function themeTokens(choice: ThemeChoice, mode: ColorMode): Record<string, string> {
  const tokens = deriveTokens(resolve(choice, mode));
  return { ...tokens, ...pageTokens(tokens, mode) };
}

export interface AppearanceSummary {
  themeName: string;
  badgeHex: string;
  accentId: string;
  separate: boolean;
  background: string;
  foreground: string;
  contrast: string;
}

function hex(value: string): string {
  const color = parseCssColor(value);
  return color ? formatHex(color) : value;
}

// Like the app: with separate modes off it edits the light slot in either mode,
// but an unset colour shows the on-screen mode's default.
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

export function defaultThemeCss(): string {
  return [
    `:root{${declarations(themeTokens(SITE_THEME, 'light'))}}`,
    `.dark{${declarations(themeTokens(SITE_THEME, 'dark'))}}`,
  ].join('\n');
}
