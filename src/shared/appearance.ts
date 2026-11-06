/**
 * Appearance model: the persisted shape of every visual preference, the accent
 * presets, and a tolerant parser. Values here are data only — the rendering
 * rules live in `appearanceTokens.ts` and the DOM writer in
 * `src/renderer/src/appearance/applyAppearance.ts`.
 */

import {
  DEFAULT_DIAGRAM_THEME,
  isDiagramThemeChoice,
  type DiagramThemeChoice,
} from './diagramTheme';
import { DEFAULT_CODE_THEME_ID, isCodeThemeId } from './codeTheme';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorMode = 'light' | 'dark';
export type ReduceMotion = 'system' | 'on' | 'off';

/** A preset accent id, or a custom `#rrggbb`. */
export type AccentChoice = { presetId: string } | { hex: string };

export interface FontAppearance {
  /** Family stack name from FONT_FAMILIES; null = the built-in stack. */
  ui: string | null;
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
  /** 0-100, an absolute WCAG floor for secondary text. 30 is the default. */
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
  /** Code highlighting preset (`CODE_THEME_PRESETS`); one choice for both modes. */
  codeTheme: string;
  /** Which mermaid theme diagrams are drawn in. */
  diagramTheme: DiagramThemeChoice;
}

export interface ThemeAccent {
  /** Stable identifier persisted with the user's choice. */
  id: string;
  name: string;
  swatchHex: string;
  lightOklch: string;
  darkOklch: string;
}

/**
 * Selectable accent presets: the macOS accent colours, light and dark variants.
 * `deriveTokens` fits them per role, so a light hue like Yellow fills and reads
 * darker than its swatch.
 */
export const ACCENT_PRESETS: readonly ThemeAccent[] = [
  {
    id: 'blue',
    name: 'Blue',
    swatchHex: '#007aff',
    lightOklch: 'oklch(0.603 0.218 257.4)',
    darkOklch: 'oklch(0.624 0.206 255.5)',
  },
  {
    id: 'purple',
    name: 'Purple',
    swatchHex: '#953d96',
    lightOklch: 'oklch(0.513 0.162 327.2)',
    darkOklch: 'oklch(0.569 0.157 326.5)',
  },
  {
    id: 'pink',
    name: 'Pink',
    swatchHex: '#f74f9e',
    lightOklch: 'oklch(0.681 0.215 355.5)',
    darkOklch: 'oklch(0.681 0.215 355.5)',
  },
  {
    id: 'red',
    name: 'Red',
    swatchHex: '#e0383e',
    lightOklch: 'oklch(0.6 0.204 24.2)',
    darkOklch: 'oklch(0.679 0.209 23.1)',
  },
  {
    id: 'orange',
    name: 'Orange',
    swatchHex: '#f7821b',
    lightOklch: 'oklch(0.725 0.174 54)',
    darkOklch: 'oklch(0.725 0.174 54)',
  },
  {
    id: 'yellow',
    name: 'Yellow',
    swatchHex: '#ffc726',
    lightOklch: 'oklch(0.856 0.168 86.9)',
    darkOklch: 'oklch(0.854 0.175 87.5)',
  },
  {
    id: 'green',
    name: 'Green',
    swatchHex: '#62ba46',
    lightOklch: 'oklch(0.709 0.175 138.9)',
    darkOklch: 'oklch(0.709 0.175 138.9)',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    swatchHex: '#989898',
    lightOklch: 'oklch(0.68 0 0)',
    darkOklch: 'oklch(0.64 0 0)',
  },
];

/** Retired preset ids mapped to the nearest current one, so a saved choice survives. */
const RETIRED_ACCENT_PRESET_IDS: Readonly<Record<string, string>> = {
  indigo: 'blue',
  violet: 'purple',
  sky: 'blue',
  teal: 'green',
  emerald: 'green',
  amber: 'orange',
  rose: 'red',
};

export const DEFAULT_THEME_ACCENT_ID = 'blue';

export const CONTRAST_MIN = 0;
export const CONTRAST_MAX = 100;
/** Softer than the original palette; the slider can push it back to 73. */
export const DEFAULT_CONTRAST = 30;

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

export function isFontFamilyName(value: unknown): value is FontFamilyName {
  // Cast required: TS Array.includes() does not accept unknown.
  return typeof value === 'string' && (FONT_FAMILIES as readonly string[]).includes(value);
}

/**
 * CSS stacks for the whitelist. Only families that ship with macOS or that the
 * app can reasonably expect are listed; a missing family falls through to the
 * role's default stack instead of leaving the browser to guess.
 */
export const FONT_STACKS: Record<FontFamilyName, string> = {
  System:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  'SF Pro': "'SF Pro Text', 'SF Pro Display', -apple-system, sans-serif",
  'SF Mono': "'SF Mono', ui-monospace, monospace",
  'Helvetica Neue': "'Helvetica Neue', Helvetica, sans-serif",
  Inter: 'Inter, -apple-system, sans-serif',
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace",
  Menlo: 'Menlo, ui-monospace, monospace',
  Georgia: "Georgia, 'Times New Roman', serif",
  'Iowan Old Style': "'Iowan Old Style', Georgia, serif",
};

/**
 * Two families, not three. Messages and the app around them are one reading
 * surface, and the way two sans-serif stacks side by side differ is not
 * something a reader can use; code is a different problem (a monospace grid, a
 * fixed advance width) and keeps its own family and size.
 */
export type FontRole = 'ui' | 'code';

/**
 * The family each role falls back to when the slot stores null. The picker uses
 * it as the stored value's stand-in, so a role only ever shows one entry for
 * its own default and no family appears twice in the list.
 */
export const DEFAULT_FONT_FAMILY: Record<FontRole, FontFamilyName> = {
  ui: 'System',
  code: 'SF Mono',
};

const DEFAULT_FONT_STACKS: Record<FontRole, string> = {
  ui: FONT_STACKS[DEFAULT_FONT_FAMILY.ui],
  code: FONT_STACKS[DEFAULT_FONT_FAMILY.code],
};

export function fontStackFor(role: FontRole, name: string | null): string {
  return isFontFamilyName(name) ? FONT_STACKS[name] : DEFAULT_FONT_STACKS[role];
}

const DEFAULT_FONTS: FontAppearance = {
  ui: null,
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
  codeTheme: DEFAULT_CODE_THEME_ID,
  diagramTheme: DEFAULT_DIAGRAM_THEME,
};

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const REDUCE_MOTION_VALUES: readonly ReduceMotion[] = ['system', 'on', 'off'];

export function findAccentPreset(id: string): ThemeAccent {
  return ACCENT_PRESETS.find((preset) => preset.id === id) ?? ACCENT_PRESETS[0];
}

/** A current preset id, or the one that replaced a retired id; null otherwise. */
export function resolveAccentPresetId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (ACCENT_PRESETS.some((preset) => preset.id === value)) return value;
  return RETIRED_ACCENT_PRESET_IDS[value] ?? null;
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
  const presetId = resolveAccentPresetId(raw.presetId);
  if (presetId) {
    return { presetId };
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
  const family = (value: unknown): string | null => (isFontFamilyName(value) ? value : null);
  // A stored `content` family from the three-role version is adopted as the
  // text family when the reader had not set one, so a deliberate reading font
  // is not silently dropped.
  return {
    ui: family(raw.ui) ?? family(raw.content),
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

/**
 * Parses a stored appearance object. `diagramThemeFallback` carries the value
 * from the version that kept the diagram theme under `chat`.
 */
export function parseAppearance(
  raw: unknown,
  diagramThemeFallback: DiagramThemeChoice = DEFAULT_DIAGRAM_THEME,
): AppearanceSettings {
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
    codeTheme: isCodeThemeId(record.codeTheme) ? record.codeTheme : DEFAULT_APPEARANCE.codeTheme,
    diagramTheme: isDiagramThemeChoice(record.diagramTheme)
      ? record.diagramTheme
      : diagramThemeFallback,
  };
}
