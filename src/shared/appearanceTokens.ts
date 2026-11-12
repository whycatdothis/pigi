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
 * Contrast anchors for the slider. The numbers at 73 are the ones the palette
 * was designed around and the ones `docs/appearance.md` documents; the shipped
 * slider starts below that, at 30. Dark mode asks for a higher physical ratio
 * at the same position because the same ratio reads weaker on a dark surface.
 *
 * Slider position 0 / 73 / 100.
 */
const CONTRAST_PROFILES: Record<ColorMode, { secondaryText: number[]; border: number[] }> = {
  light: { secondaryText: [4.5, 5.0, 7.0], border: [1.15, 1.3, 3.0] },
  dark: { secondaryText: [5.5, 7.0, 10.0], border: [1.25, 1.45, 3.0] },
};

/** The middle anchor: below it the values interpolate toward the 0 anchor. */
const CONTRAST_ANCHOR = 73;

/**
 * Contrast anchors for the minimap's ticks, on the slider's 0 / 73 / 100.
 *
 * Antialiasing spreads a thin line over several device rows, so a colour at the
 * border ratio paints fainter than its ratio reads; these sit above it, over a
 * wide range so the rail goes from a light grey to nearly the secondary text.
 */
const TICK_PROFILES: Record<ColorMode, number[]> = {
  light: [1.4, 2.2, 5.5],
  dark: [1.6, 2.7, 6.5],
};

export function minimapTickTarget(contrast: number, mode: ColorMode): number {
  return interpolate(TICK_PROFILES[mode], contrast);
}

/**
 * Surface steps toward the foreground, in oklab lightness. These reproduce the
 * pre-appearance palette exactly: light cards and popovers are the background
 * itself, dark ones sit one step above it.
 */
const SURFACE_STEPS: Record<ColorMode, number> = { light: 0.037, dark: 0.146 };
const CARD_STEPS: Record<ColorMode, number> = { light: 0, dark: 0.0714 };
const SIDEBAR_STEPS: Record<ColorMode, number> = { light: 0, dark: 0.148 };
/** How far the shimmer's highlight is mixed toward white, from the secondary
 *  text it sweeps across. The band has to read as light crossing the label, so
 *  it goes almost all the way: a 60% mix is barely visible on a white page. */
const SHIMMER_WHITE_MIX = 0.85;
/** The accent tint behind the user's messages and the queue bars. */
const ACCENT_SUBTLE_MIX = 0.08;
/** What the usual 8% gives the dark presets on a white page (1.10-1.12). */
const ACCENT_SUBTLE_LIGHT_CONTRAST = 1.08;
/** The step of `--muted` on near-black; at 8% the tint sat at 1.15:1 and vanished. */
const ACCENT_SUBTLE_DARK_CONTRAST = 1.3;
/** A tint, not a second accent, even where the floor cannot be reached. */
const ACCENT_SUBTLE_MAX_MIX = 0.25;

function interpolate(values: number[], contrast: number): number {
  const clamped = Math.min(100, Math.max(0, contrast));
  if (clamped <= CONTRAST_ANCHOR) {
    const t = clamped / CONTRAST_ANCHOR;
    return values[0] + (values[1] - values[0]) * t;
  }
  const t = (clamped - CONTRAST_ANCHOR) / (100 - CONTRAST_ANCHOR);
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

/**
 * An accent does two different jobs, and one colour cannot do both in dark
 * mode. A filled button carries a label, so it stays dark enough for white
 * text; accent-coloured text, icons and rings sit on the page, so on a dark
 * page they stay light enough to read. GitHub ships `accent.emphasis` and
 * `accent.fg` for the same reason. On a light page both are one colour.
 *
 * Accents are scaled, not walked to a fixed contrast: walking until white read
 * at 4.5:1 turned Yellow mustard and Pink raspberry. Chroma stays below the
 * point where a hue clips out of sRGB; no floor, since Graphite is meant to be
 * grey.
 */
const WHITE = requireColor('#ffffff');
const NEAR_BLACK = requireColor('#0b0b0b');

/** Fill lightness scale: Yellow 0.86 → 0.80 on a light page; further on a dark one, where a bright fill glares. */
const ACCENT_FILL_RATIO: Record<ColorMode, number> = { light: 0.93, dark: 0.85 };
const ACCENT_CHROMA_MAX = 0.22;
/** Where dark-mode text, icons and rings sit, light enough to read on near-black. */
const DARK_TEXT_BAND = [0.66, 0.8] as const;
/** The non-text floor: labels on fills, fills against the page, accent text. */
const NON_TEXT_CONTRAST = 3;
/** Below this white is unreadable (Yellow, 1.9:1), so the label goes near-black. */
const DARK_LABEL_BELOW = 2.5;
/**
 * A near-black label carries a light fill on its own, so the fill only has to
 * show as a shape: Yellow on white is 1.9:1, a picked #ffffff would vanish.
 */
const LIGHT_FILL_PAGE_CONTRAST = 1.5;

function labelFor(fill: OklchColor): OklchColor {
  return contrastRatio(WHITE, fill) >= DARK_LABEL_BELOW ? WHITE : NEAR_BLACK;
}

/**
 * The fill is pushed off the page first, then its label is chosen and wins: on
 * a mid-tone page both cannot hold, and a label that cannot be read is worse
 * than a fill that sits close to the page. A fill that starts too light for
 * white keeps its near-black label, so a grey page cannot walk Yellow to
 * mustard under white.
 */
function fitFill(
  accent: OklchColor,
  mode: ColorMode,
  background: OklchColor,
): { fill: OklchColor; label: OklchColor } {
  const scaled = { ...accent, lightness: accent.lightness * ACCENT_FILL_RATIO[mode] };
  const darkLabel = labelFor(scaled) === NEAR_BLACK;
  const separated = ensureContrast(
    scaled,
    background,
    darkLabel ? LIGHT_FILL_PAGE_CONTRAST : NON_TEXT_CONTRAST,
  );
  const label = darkLabel ? NEAR_BLACK : labelFor(separated);
  return { fill: ensureContrast(separated, label, NON_TEXT_CONTRAST), label };
}

/**
 * The fill on a light page, the dark text band on a dark one, then walked to
 * 3:1 against the page. 4.5:1 turned Yellow brown on white, and lifting a
 * saturated hue off a mid-grey page clips before it gets there.
 */
function fitText(
  accent: OklchColor,
  fill: OklchColor,
  mode: ColorMode,
  background: OklchColor,
): OklchColor {
  const [darkMin, darkMax] = DARK_TEXT_BAND;
  const text =
    mode === 'light'
      ? fill
      : { ...accent, lightness: Math.min(darkMax, Math.max(darkMin, accent.lightness)) };
  return ensureContrast(text, background, NON_TEXT_CONTRAST);
}

/** The accent the user picked, before any fitting. */
function readAccent(accent: AccentChoice, mode: ColorMode): OklchColor {
  if ('presetId' in accent) {
    const preset = findAccentPreset(accent.presetId);
    return requireColor(mode === 'dark' ? preset.darkOklch : preset.lightOklch);
  }
  if ('hex' in accent) {
    const parsed = parseCssColor(accent.hex);
    if (parsed) {
      return parsed;
    }
  }
  const fallbackPreset = findAccentPreset(DEFAULT_THEME_ACCENT_ID);
  return requireColor(mode === 'dark' ? fallbackPreset.darkOklch : fallbackPreset.lightOklch);
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

/** Foreground floor for anything the reader typed: below this it is unreadable. */
const FOREGROUND_CONTRAST_FLOOR = 7;

/** The three solved inputs every color token is derived from. */
function resolveColorInputs(resolved: ResolvedAppearance): {
  background: OklchColor;
  foreground: OklchColor;
  targets: ContrastTargets;
} {
  const defaults = DEFAULT_MODE_COLORS[resolved.mode];
  const background = parseColor(resolved.slot.background, defaults.background);
  const foreground = ensureContrast(
    parseColor(resolved.slot.foreground, defaults.foreground),
    background,
    FOREGROUND_CONTRAST_FLOOR,
  );
  return {
    background,
    foreground,
    targets: contrastTargets(resolved.slot.contrast, resolved.mode),
  };
}

/** Secondary text: the foreground mixed toward the page until it just passes. */
function secondaryTextColor(
  background: OklchColor,
  foreground: OklchColor,
  targets: ContrastTargets,
): OklchColor {
  return mixOklch(
    foreground,
    background,
    solveMaxMixAmount(foreground, background, background, targets.secondaryText),
  );
}

export function deriveTokens(resolved: ResolvedAppearance): Record<string, string> {
  const { mode, slot } = resolved;

  const { background, foreground, targets } = resolveColorInputs(resolved);
  const borderAmount = solveMixAmount(background, foreground, background, targets.border);

  // Surfaces use fixed per-mode steps toward the foreground (documented in
  // docs/appearance.md). They are decoration without a WCAG floor, so they
  // deliberately do not follow the contrast slider: that keeps the default
  // look identical and only the borders/text respond to the control.
  const surfaceStep = SURFACE_STEPS[mode];
  const surface = (factor: number): OklchColor =>
    mixOklch(background, foreground, surfaceStep * factor);
  const secondaryText = secondaryTextColor(background, foreground, targets);
  const minimapTick = mixOklch(
    background,
    foreground,
    solveMixAmount(background, foreground, background, minimapTickTarget(slot.contrast, mode)),
  );
  // The thinking label's sweep is a specular highlight, so it is mixed toward
  // white instead of toward `--foreground`: the foreground is near-black on a
  // light theme, and a dark band travelling across the label reads as a smudge
  // rather than a shine. Mixing from the secondary text keeps the hue and
  // guarantees the band is lighter than the text it crosses in every theme.
  const shimmerHighlight = mixOklch(secondaryText, WHITE, SHIMMER_WHITE_MIX);

  const picked = readAccent(slot.accent, mode);
  const accentBase = { ...picked, chroma: Math.min(ACCENT_CHROMA_MAX, picked.chroma) };
  const { fill: fillAccent, label: fillLabel } = fitFill(accentBase, mode, background);
  const textAccent = fitText(accentBase, fillAccent, mode, background);
  // Light mode tints with the fill, dark mode with the lighter text accent;
  // either way the mix grows until the tint separates from the page. A flat 8%
  // left a Yellow tint invisible on white and every tint invisible on near-black.
  const [tintSource, tintContrast] =
    mode === 'light'
      ? [fillAccent, ACCENT_SUBTLE_LIGHT_CONTRAST]
      : [textAccent, ACCENT_SUBTLE_DARK_CONTRAST];
  const accentSubtle = mixOklch(
    background,
    tintSource,
    Math.min(
      ACCENT_SUBTLE_MAX_MIX,
      Math.max(ACCENT_SUBTLE_MIX, solveMixAmount(background, tintSource, background, tintContrast)),
    ),
  );
  // Hover moves away from the page in both modes: darker on light, lighter on
  // dark. Fading the fill toward the background, the usual shortcut, would
  // darken it in dark mode and read as pressed. A fill already at 3:1 against
  // its label would lose it that way, so it moves away from the label instead.
  const awayFromPage = mixOklch(
    fillAccent,
    mode === 'dark' ? WHITE : NEAR_BLACK,
    mode === 'dark' ? 0.12 : 0.1,
  );
  const hoverAccent =
    contrastRatio(awayFromPage, fillLabel) >= NON_TEXT_CONTRAST
      ? awayFromPage
      : mixOklch(fillAccent, fillLabel === WHITE ? NEAR_BLACK : WHITE, 0.1);

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
    '--app-primary': formatOklch(fillAccent),
    '--app-primary-foreground': formatOklch(fillLabel),
    '--app-primary-hover': formatOklch(hoverAccent),
    '--app-secondary': formatOklch(muted),
    '--app-secondary-foreground': formatOklch(foreground),
    '--app-muted': formatOklch(muted),
    '--app-muted-foreground': formatOklch(secondaryText),
    '--app-shimmer-highlight': formatOklch(shimmerHighlight),
    '--app-accent-subtle': formatOklch(accentSubtle),
    '--app-accent': formatOklch(hover),
    '--app-accent-foreground': formatOklch(foreground),
    '--app-destructive': formatOklch(status.danger.fg),
    '--app-border': formatOklch(mixOklch(background, foreground, borderAmount)),
    '--app-minimap-tick': formatOklch(minimapTick),
    '--app-input': formatOklch(mixOklch(background, foreground, borderAmount)),
    '--app-ring': formatOklch(textAccent),
    '--app-sidebar': sidebarTint,
    '--app-sidebar-solid': formatOklch(sidebarSolid),
    '--app-sidebar-foreground': formatOklch(foreground),
    '--app-sidebar-primary': formatOklch(fillAccent),
    '--app-sidebar-primary-foreground': formatOklch(fillLabel),
    '--app-sidebar-accent': alphaMix(foreground, 0.1),
    '--app-sidebar-accent-foreground': formatOklch(foreground),
    '--app-sidebar-border': formatOklch(mixOklch(background, foreground, borderAmount)),
    '--app-sidebar-ring': formatOklch(textAccent),
    '--app-system-accent': formatOklch(textAccent),
    '--app-system-accent-foreground': formatOklch(WHITE),
  };

  for (const [name, palette] of Object.entries(status)) {
    tokens[`--app-${name}-fg`] = formatOklch(palette.fg);
    tokens[`--app-${name}-bg`] = formatOklch(palette.bg);
    tokens[`--app-${name}-border`] = formatOklch(palette.border);
  }

  const { fonts } = slot;
  tokens['--app-font-ui'] = fontStackFor('ui', fonts.ui);
  tokens['--app-font-code'] = fontStackFor('code', fonts.code);
  tokens['--app-font-ui-scale'] = String(fonts.uiSize / DEFAULT_UI_FONT_SIZE);
  tokens['--app-font-code-scale'] = String(fonts.codeSize / DEFAULT_CODE_FONT_SIZE);

  return tokens;
}

/** Resolved secondary-text contrast, shown next to the slider. */
export function resolvedSecondaryContrast(resolved: ResolvedAppearance): number {
  const { background, foreground, targets } = resolveColorInputs(resolved);
  return contrastRatio(secondaryTextColor(background, foreground, targets), background);
}
