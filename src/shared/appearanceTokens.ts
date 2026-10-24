/**
 * Appearance derivation: settings object in, CSS custom properties out.
 *
 * Two responsibilities, both pure:
 *
 * 1. `resolveAppearance` picks the mode and the slot (shared or per-mode).
 * 2. `deriveTokens` turns that slot into every app color token. User colors are
 *    inputs; everything else is solved so it keeps a documented WCAG floor
 *    instead of relying on hand-tuned constants.
 *
 * The renderer writes the result to the document root; nothing in this file
 * touches the DOM.
 */
import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_THEME_ACCENT_ID,
  DEFAULT_UI_FONT_SIZE,
  findAccentPreset,
  fontStackFor,
  type AccentChoice,
  type AppearanceSettings,
  type ColorMode,
  type ModeAppearance,
} from './appearance';
import {
  contrastRatio,
  ensureContrast,
  formatHex,
  formatOklch,
  mixOklch,
  parseCssColor,
  solveMaxMixAmount,
  solveMixAmount,
  withLightness,
  type OklchColor,
} from './colorMath';

export interface AppearanceEnvironment {
  /** `prefers-color-scheme: dark`. */
  systemIsDark: boolean;
  /** `prefers-reduced-motion: reduce`. */
  systemPrefersReducedMotion: boolean;
}

export interface ResolvedAppearance {
  mode: ColorMode;
  slot: ModeAppearance;
  reduceMotion: boolean;
  fontSmoothing: boolean;
}

export interface ContrastTargets {
  /** Minimum contrast for secondary text against the background. */
  secondaryText: number;
  /** Minimum contrast for borders and dividers against the background. */
  border: number;
}

/** Built-in colors for `background: null` / `foreground: null`. */
export const DEFAULT_MODE_COLORS: Record<ColorMode, { background: string; foreground: string }> = {
  light: { background: '#ffffff', foreground: '#1a1c1f' },
  dark: { background: 'oklch(0.145 0 0)', foreground: 'oklch(0.985 0 0)' },
};

/**
 * Contrast anchors for the slider. Values at 73 are the shipped defaults; dark
 * mode asks for a higher physical ratio because the same ratio reads weaker on
 * a dark surface.
 *
 * Slider position 0 / 73 / 100.
 */
const CONTRAST_PROFILES: Record<ColorMode, { secondaryText: number[]; border: number[] }> = {
  light: { secondaryText: [4.5, 5.0, 7.0], border: [1.15, 1.3, 3.0] },
  dark: { secondaryText: [5.5, 7.0, 10.0], border: [1.25, 1.45, 3.0] },
};

const DEFAULT_CONTRAST_ANCHOR = 73;

/**
 * Surface steps toward the foreground, in oklab lightness. These reproduce the
 * pre-appearance palette exactly: light cards and popovers are the background
 * itself, dark ones sit one step above it.
 */
const SURFACE_STEPS: Record<ColorMode, number> = { light: 0.037, dark: 0.146 };
const CARD_STEPS: Record<ColorMode, number> = { light: 0, dark: 0.0714 };
const SIDEBAR_STEPS: Record<ColorMode, number> = { light: 0, dark: 0.148 };
/** Primary is the "solid button" fill: the foreground in light, one step dimmer in dark. */
const PRIMARY_STEPS: Record<ColorMode, number> = { light: 1, dark: 0.925 };
const PRIMARY_FOREGROUND_STEPS: Record<ColorMode, number> = { light: 0, dark: 0.0714 };

function interpolate(values: number[], contrast: number): number {
  const clamped = Math.min(100, Math.max(0, contrast));
  if (clamped <= DEFAULT_CONTRAST_ANCHOR) {
    const t = clamped / DEFAULT_CONTRAST_ANCHOR;
    return values[0] + (values[1] - values[0]) * t;
  }
  const t = (clamped - DEFAULT_CONTRAST_ANCHOR) / (100 - DEFAULT_CONTRAST_ANCHOR);
  return values[1] + (values[2] - values[1]) * t;
}

export function contrastTargets(contrast: number, mode: ColorMode): ContrastTargets {
  const profile = CONTRAST_PROFILES[mode];
  return {
    secondaryText: interpolate(profile.secondaryText, contrast),
    border: interpolate(profile.border, contrast),
  };
}

/** Picks the mode and slot; `separateModes` decides whether light is shared. */
export function resolveAppearance(
  settings: AppearanceSettings,
  environment: AppearanceEnvironment,
): ResolvedAppearance {
  const mode: ColorMode =
    settings.mode === 'system' ? (environment.systemIsDark ? 'dark' : 'light') : settings.mode;
  const slot = settings.separateModes ? settings[mode] : settings.light;
  const reduceMotion =
    settings.reduceMotion === 'system'
      ? environment.systemPrefersReducedMotion
      : settings.reduceMotion === 'on';

  return { mode, slot, reduceMotion, fontSmoothing: settings.fontSmoothing };
}

function requireColor(value: string): OklchColor {
  const parsed = parseCssColor(value);
  if (!parsed) {
    throw new Error(`Unparseable color token: ${value}`);
  }
  return parsed;
}

function parseColor(value: string | null, fallback: string): OklchColor {
  return (value === null ? null : parseCssColor(value)) ?? requireColor(fallback);
}

/** Clamps a custom accent into a legible range for the mode. */
function resolveAccent(accent: AccentChoice, mode: ColorMode, background: OklchColor): OklchColor {
  if ('presetId' in accent) {
    const preset = findAccentPreset(accent.presetId);
    return ensureContrast(
      requireColor(mode === 'dark' ? preset.darkOklch : preset.lightOklch),
      background,
      4.5,
    );
  }
  if ('hex' in accent) {
    const parsed = parseCssColor(accent.hex);
    if (parsed) {
      const lightnessRange = mode === 'dark' ? [0.68, 0.78] : [0.5, 0.62];
      const lightness = Math.min(lightnessRange[1], Math.max(lightnessRange[0], parsed.lightness));
      const clamped = withLightness(
        { ...parsed, chroma: Math.min(0.22, Math.max(0.08, parsed.chroma)) },
        lightness,
      );
      return ensureContrast(clamped, background, 4.5);
    }
  }
  const fallbackPreset = findAccentPreset(DEFAULT_THEME_ACCENT_ID);
  const fallback = requireColor(
    mode === 'dark' ? fallbackPreset.darkOklch : fallbackPreset.lightOklch,
  );
  return ensureContrast(fallback, background, 4.5);
}

interface StatusPalette {
  fg: OklchColor;
  bg: OklchColor;
  border: OklchColor;
}

const STATUS_HUES = { success: 145, warning: 75, danger: 27, info: 250 } as const;

/**
 * Status base colors per mode. Light bases sit at Tailwind 600/700 vividness
 * (so `destructive` still reads as red), dark bases at 400/500. The contrast
 * solver only moves them when they miss the floor.
 */
const STATUS_BASES: Record<string, Record<ColorMode, { lightness: number; chroma: number }>> = {
  success: { light: { lightness: 0.53, chroma: 0.17 }, dark: { lightness: 0.72, chroma: 0.16 } },
  warning: { light: { lightness: 0.6, chroma: 0.14 }, dark: { lightness: 0.8, chroma: 0.14 } },
  danger: { light: { lightness: 0.585, chroma: 0.235 }, dark: { lightness: 0.72, chroma: 0.18 } },
  info: { light: { lightness: 0.58, chroma: 0.18 }, dark: { lightness: 0.7, chroma: 0.15 } },
};

function deriveStatusColor(
  name: keyof typeof STATUS_BASES,
  hue: number,
  mode: ColorMode,
  background: OklchColor,
): StatusPalette {
  const base: OklchColor = { ...STATUS_BASES[name][mode], hue };
  const fg = ensureContrast(base, background, 4.5);
  return {
    fg,
    bg: mixOklch(background, fg, 0.12),
    border: mixOklch(background, fg, 0.3),
  };
}

function alphaMix(color: OklchColor, amount: number): string {
  return `color-mix(in srgb, ${formatHex(color)} ${Math.round(amount * 100)}%, transparent)`;
}

/**
 * Derives every color token. Surfaces follow the solved border amount because
 * they have no WCAG floor of their own, so they stay in proportion to the
 * user's contrast choice.
 */
export function deriveTokens(resolved: ResolvedAppearance): Record<string, string> {
  const { mode, slot } = resolved;
  const defaults = DEFAULT_MODE_COLORS[mode];

  const background = parseColor(slot.background, defaults.background);
  const storedForeground = parseColor(slot.foreground, defaults.foreground);
  const foreground = ensureContrast(storedForeground, background, 7);

  const targets = contrastTargets(slot.contrast, mode);
  const borderAmount = solveMixAmount(background, foreground, background, targets.border);

  // Surfaces use fixed per-mode steps toward the foreground (documented in
  // docs/appearance.md). They are decoration without a WCAG floor, so they
  // deliberately do not follow the contrast slider: that keeps the default
  // look identical and only the borders/text respond to the control.
  const surfaceStep = SURFACE_STEPS[mode];
  const surface = (factor: number): OklchColor =>
    mixOklch(background, foreground, surfaceStep * factor);
  const secondaryText = mixOklch(
    foreground,
    background,
    solveMaxMixAmount(foreground, background, background, targets.secondaryText),
  );

  const accent = resolveAccent(slot.accent, mode, background);
  const white = requireColor('#ffffff');
  const nearBlack = requireColor('#0b0b0b');
  const accentForeground =
    contrastRatio(white, accent) >= contrastRatio(nearBlack, accent) ? white : nearBlack;

  const card = mixOklch(background, foreground, CARD_STEPS[mode]);
  const popover = card;
  const muted = surface(1);
  const hover = surface(1);
  const sidebarSurface = mixOklch(background, foreground, SIDEBAR_STEPS[mode]);
  const sidebarSolid = mixOklch(background, sidebarSurface, 0.55);
  const sidebarTint = slot.translucentSidebar
    ? alphaMix(sidebarSurface, 0.55)
    : formatOklch(sidebarSurface);

  const status = {
    success: deriveStatusColor('success', STATUS_HUES.success, mode, background),
    warning: deriveStatusColor('warning', STATUS_HUES.warning, mode, background),
    danger: deriveStatusColor('danger', STATUS_HUES.danger, mode, background),
    info: deriveStatusColor('info', STATUS_HUES.info, mode, background),
  };

  const tokens: Record<string, string> = {
    '--app-background': formatOklch(background),
    '--app-foreground': formatOklch(foreground),
    '--app-card': formatOklch(card),
    '--app-card-foreground': formatOklch(foreground),
    '--app-popover': formatOklch(popover),
    '--app-popover-foreground': formatOklch(foreground),
    '--app-primary': formatOklch(mixOklch(background, foreground, PRIMARY_STEPS[mode])),
    '--app-primary-foreground': formatOklch(
      mixOklch(background, foreground, PRIMARY_FOREGROUND_STEPS[mode]),
    ),
    '--app-secondary': formatOklch(muted),
    '--app-secondary-foreground': formatOklch(foreground),
    '--app-muted': formatOklch(muted),
    '--app-muted-foreground': formatOklch(secondaryText),
    '--app-accent': formatOklch(hover),
    '--app-accent-foreground': formatOklch(foreground),
    '--app-destructive': formatOklch(status.danger.fg),
    '--app-border': formatOklch(mixOklch(background, foreground, borderAmount)),
    '--app-input': formatOklch(mixOklch(background, foreground, borderAmount)),
    '--app-ring': formatOklch(accent),
    '--app-sidebar': sidebarTint,
    '--app-sidebar-solid': formatOklch(sidebarSolid),
    '--app-sidebar-foreground': formatOklch(foreground),
    '--app-sidebar-primary': formatOklch(mixOklch(background, foreground, PRIMARY_STEPS[mode])),
    '--app-sidebar-primary-foreground': formatOklch(
      mixOklch(background, foreground, PRIMARY_FOREGROUND_STEPS[mode]),
    ),
    '--app-sidebar-accent': alphaMix(foreground, 0.1),
    '--app-sidebar-accent-foreground': formatOklch(foreground),
    '--app-sidebar-border': formatOklch(mixOklch(background, foreground, borderAmount)),
    '--app-sidebar-ring': formatOklch(accent),
    '--app-system-accent': formatOklch(accent),
    '--app-system-accent-foreground': formatOklch(accentForeground),
  };

  for (const [name, palette] of Object.entries(status)) {
    tokens[`--app-${name}-fg`] = formatOklch(palette.fg);
    tokens[`--app-${name}-bg`] = formatOklch(palette.bg);
    tokens[`--app-${name}-border`] = formatOklch(palette.border);
  }

  const { fonts } = slot;
  tokens['--app-font-ui'] = fontStackFor('ui', fonts.ui);
  tokens['--app-font-content'] = fontStackFor('content', fonts.content);
  tokens['--app-font-code'] = fontStackFor('code', fonts.code);
  tokens['--app-font-ui-scale'] = String(fonts.uiSize / DEFAULT_UI_FONT_SIZE);
  tokens['--app-font-code-scale'] = String(fonts.codeSize / DEFAULT_CODE_FONT_SIZE);

  return tokens;
}

/** Resolved secondary-text contrast, shown next to the slider. */
export function resolvedSecondaryContrast(resolved: ResolvedAppearance): number {
  const defaults = DEFAULT_MODE_COLORS[resolved.mode];
  const background = parseColor(resolved.slot.background, defaults.background);
  const foreground = ensureContrast(
    parseColor(resolved.slot.foreground, defaults.foreground),
    background,
    7,
  );
  const targets = contrastTargets(resolved.slot.contrast, resolved.mode);
  const muted = mixOklch(
    foreground,
    background,
    solveMaxMixAmount(foreground, background, background, targets.secondaryText),
  );
  return contrastRatio(muted, background);
}

/** Formats a stored color for the settings UI, falling back to the default. */
export function displayColor(
  value: string | null,
  mode: ColorMode,
  role: 'background' | 'foreground',
): string {
  const fallback = requireColor(DEFAULT_MODE_COLORS[mode][role]);
  return formatHex((value === null ? null : parseCssColor(value)) ?? fallback);
}
