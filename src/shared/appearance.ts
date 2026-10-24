/**
 * Appearance model: the persisted shape of every visual preference, the accent
 * presets, and a tolerant parser. Values here are data only — the rendering
 * rules live in `appearanceTokens.ts` and the DOM writer in
 * `src/renderer/src/appearance/applyAppearance.ts`.
 *
 * Per-mode slots exist from the start: `separateModes` decides whether the
 * light slot is shared or light and dark are configured independently.
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorMode = 'light' | 'dark';
export type ReduceMotion = 'system' | 'on' | 'off';

/** A preset accent id, or a custom `#rrggbb`. */
export type AccentChoice = { presetId: string } | { hex: string };

export interface FontAppearance {
  /** Family stack name from FONT_FAMILIES; null = the built-in stack. */
  ui: string | null;
  content: string | null;
  code: string | null;
  /** UI text size in px. Anchors the whole UI type scale. */
  uiSize: number;
  /** Code text size in px. */
  codeSize: number;
}

export interface ModeAppearance {
  /** null = the built-in default for the resolved mode. */
  background: string | null;
  foreground: string | null;
  accent: AccentChoice;
  /** 0-100. 73 is the default and matches the historical look. */
  contrast: number;
  translucentSidebar: boolean;
  fonts: FontAppearance;
}

export interface AppearanceSettings {
  mode: ThemeMode;
  /** When false the light slot is authoritative for both modes. */
  separateModes: boolean;
  light: ModeAppearance;
  dark: ModeAppearance;
  reduceMotion: ReduceMotion;
  fontSmoothing: boolean;
}

export interface ThemeAccent {
  /** Stable identifier persisted with the user's choice. */
  id: string;
  /** Human-readable label for the picker. */
  name: string;
  /** Swatch color shown in the picker. */
  swatchHex: string;
  /** Accent oklch tuned for light mode. */
  lightOklch: string;
  /** Accent oklch tuned for dark mode. */
  darkOklch: string;
}

/**
 * Selectable accent presets. Light values stay dark enough to read as link
 * text on white; dark values are lifted to stay legible on a dark surface.
 */
export const ACCENT_PRESETS: readonly ThemeAccent[] = [
  {
    id: 'indigo',
    name: 'Indigo',
    swatchHex: '#6366f1',
    lightOklch: 'oklch(0.55 0.2 277.1)',
    darkOklch: 'oklch(0.7 0.17 277.1)',
  },
  {
    id: 'violet',
    name: 'Violet',
    swatchHex: '#7c5cfc',
    lightOklch: 'oklch(0.56 0.22 286.5)',
    darkOklch: 'oklch(0.72 0.19 286.5)',
  },
  {
    id: 'blue',
    name: 'Blue',
    swatchHex: '#3b82f6',
    lightOklch: 'oklch(0.55 0.18 259.8)',
    darkOklch: 'oklch(0.7 0.16 259.8)',
  },
  {
    id: 'sky',
    name: 'Sky',
    swatchHex: '#0ea5e9',
    lightOklch: 'oklch(0.55 0.15 237.3)',
    darkOklch: 'oklch(0.72 0.13 237.3)',
  },
  {
    id: 'teal',
    name: 'Teal',
    swatchHex: '#14b8a6',
    lightOklch: 'oklch(0.54 0.12 182.5)',
    darkOklch: 'oklch(0.74 0.12 182.5)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    swatchHex: '#10b981',
    lightOklch: 'oklch(0.53 0.15 162.5)',
    darkOklch: 'oklch(0.74 0.14 162.5)',
  },
  {
    id: 'amber',
    name: 'Amber',
    swatchHex: '#e0724a',
    lightOklch: 'oklch(0.57 0.15 40.2)',
    darkOklch: 'oklch(0.74 0.13 40.2)',
  },
  {
    id: 'rose',
    name: 'Rose',
    swatchHex: '#f43f5e',
    lightOklch: 'oklch(0.58 0.21 16.4)',
    darkOklch: 'oklch(0.7 0.19 16.4)',
  },
];

export const DEFAULT_THEME_ACCENT_ID = 'indigo';

export const CONTRAST_MIN = 0;
export const CONTRAST_MAX = 100;
export const DEFAULT_CONTRAST = 73;

export const UI_FONT_SIZE_MIN = 12;
export const UI_FONT_SIZE_MAX = 20;
export const CODE_FONT_SIZE_MIN = 10;
export const CODE_FONT_SIZE_MAX = 20;
export const DEFAULT_UI_FONT_SIZE = 15;
export const DEFAULT_CODE_FONT_SIZE = 14;

/**
 * Font families offered by the picker. A whitelist (rather than free text)
 * keeps a missing family from silently falling back, and lets the picker show
 * a real preview.
 */
export const FONT_FAMILIES = [
  'System',
  'SF Pro',
  'SF Mono',
  'Helvetica Neue',
  'Inter',
  'JetBrains Mono',
  'Menlo',
  'Georgia',
  'Iowan Old Style',
] as const;

export type FontFamilyName = (typeof FONT_FAMILIES)[number];

const DEFAULT_FONTS: FontAppearance = {
  ui: null,
  content: null,
  code: null,
  uiSize: DEFAULT_UI_FONT_SIZE,
  codeSize: DEFAULT_CODE_FONT_SIZE,
};

export const DEFAULT_MODE_APPEARANCE: Record<ColorMode, ModeAppearance> = {
  light: {
    background: null,
    foreground: null,
    accent: { presetId: DEFAULT_THEME_ACCENT_ID },
    contrast: DEFAULT_CONTRAST,
    translucentSidebar: true,
    fonts: { ...DEFAULT_FONTS },
  },
  dark: {
    background: null,
    foreground: null,
    accent: { presetId: DEFAULT_THEME_ACCENT_ID },
    contrast: DEFAULT_CONTRAST,
    translucentSidebar: true,
    fonts: { ...DEFAULT_FONTS },
  },
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: 'system',
  separateModes: false,
  light: { ...DEFAULT_MODE_APPEARANCE.light },
  dark: { ...DEFAULT_MODE_APPEARANCE.dark },
  reduceMotion: 'system',
  fontSmoothing: true,
};

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const REDUCE_MOTION_VALUES: readonly ReduceMotion[] = ['system', 'on', 'off'];

export function findAccentPreset(id: string): ThemeAccent {
  return ACCENT_PRESETS.find((preset) => preset.id === id) ?? ACCENT_PRESETS[0];
}

export function isAccentPresetId(value: unknown): value is string {
  return typeof value === 'string' && ACCENT_PRESETS.some((preset) => preset.id === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  // Cast required: TS Array.includes() does not accept unknown.
  return typeof value === 'string' && values.includes(value as T);
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function parseStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseAccent(raw: unknown, fallback: AccentChoice): AccentChoice {
  if (!isRecord(raw)) {
    return fallback;
  }
  if (typeof raw.presetId === 'string' && isAccentPresetId(raw.presetId)) {
    return { presetId: raw.presetId };
  }
  if (typeof raw.hex === 'string') {
    return { hex: raw.hex };
  }
  return fallback;
}

function parseFonts(raw: unknown, fallback: FontAppearance): FontAppearance {
  if (!isRecord(raw)) {
    return { ...fallback };
  }
  const family = (value: unknown): string | null =>
    typeof value === 'string' && (FONT_FAMILIES as readonly string[]).includes(value)
      ? value
      : null;
  return {
    ui: family(raw.ui),
    content: family(raw.content),
    code: family(raw.code),
    uiSize: clampNumber(raw.uiSize, UI_FONT_SIZE_MIN, UI_FONT_SIZE_MAX, fallback.uiSize),
    codeSize: clampNumber(raw.codeSize, CODE_FONT_SIZE_MIN, CODE_FONT_SIZE_MAX, fallback.codeSize),
  };
}

function parseModeAppearance(raw: unknown, fallback: ModeAppearance): ModeAppearance {
  if (!isRecord(raw)) {
    return { ...fallback, accent: { ...fallback.accent }, fonts: { ...fallback.fonts } };
  }
  return {
    background: parseStringOrNull(raw.background),
    foreground: parseStringOrNull(raw.foreground),
    accent: parseAccent(raw.accent, fallback.accent),
    contrast: clampNumber(raw.contrast, CONTRAST_MIN, CONTRAST_MAX, fallback.contrast),
    translucentSidebar:
      typeof raw.translucentSidebar === 'boolean'
        ? raw.translucentSidebar
        : fallback.translucentSidebar,
    fonts: parseFonts(raw.fonts, fallback.fonts),
  };
}

/** Parses a persisted appearance blob, falling back field by field. */
export function parseAppearance(raw: unknown): AppearanceSettings {
  const record = isRecord(raw) ? raw : {};
  return {
    mode: includes(THEME_MODES, record.mode) ? record.mode : DEFAULT_APPEARANCE.mode,
    separateModes:
      typeof record.separateModes === 'boolean'
        ? record.separateModes
        : DEFAULT_APPEARANCE.separateModes,
    light: parseModeAppearance(record.light, DEFAULT_MODE_APPEARANCE.light),
    dark: parseModeAppearance(record.dark, DEFAULT_MODE_APPEARANCE.dark),
    reduceMotion: includes(REDUCE_MOTION_VALUES, record.reduceMotion)
      ? record.reduceMotion
      : DEFAULT_APPEARANCE.reduceMotion,
    fontSmoothing:
      typeof record.fontSmoothing === 'boolean'
        ? record.fontSmoothing
        : DEFAULT_APPEARANCE.fontSmoothing,
  };
}
