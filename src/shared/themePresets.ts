/**
 * Named themes: a curated palette per mode, applied to both slots at once.
 *
 * A theme only carries colors. Fonts, translucency, and the separate-modes
 * switch stay whatever the user chose, so switching themes never rearranges
 * the rest of the page. The active theme is derived by matching the slot's
 * colors against this list — nothing extra is persisted, and editing any color
 * falls back to "Custom" on its own.
 */
import {
  ACCENT_PRESETS,
  type AccentChoice,
  type AppearanceSettings,
  type ColorMode,
  type ModeAppearance,
} from './appearance';
import { normalizeHexColor } from './colorMath';

/** The color half of one mode slot. Contrast is a preference, not a theme. */
export interface ThemePresetSlot {
  background: string | null;
  foreground: string | null;
  accent: AccentChoice;
}

export interface ThemePreset {
  id: string;
  name: string;
  light: ThemePresetSlot;
  dark: ThemePresetSlot;
}

export const DEFAULT_THEME_PRESET_ID = 'default';

/** Indigo is the built-in accent, so the default theme stores no colors. */
const DEFAULT_SLOT: ThemePresetSlot = {
  background: null,
  foreground: null,
  accent: { presetId: 'indigo' },
};

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: DEFAULT_THEME_PRESET_ID,
    name: 'pigi',
    light: DEFAULT_SLOT,
    dark: DEFAULT_SLOT,
  },
  {
    id: 'github',
    name: 'GitHub',
    light: {
      background: '#ffffff',
      foreground: '#1f2328',
      accent: { hex: '#0969da' },
    },
    dark: {
      background: '#0d1117',
      foreground: '#e6edf3',
      accent: { hex: '#4493f8' },
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    light: {
      background: '#eff1f5',
      foreground: '#4c4f69',
      accent: { hex: '#8839ef' },
    },
    dark: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      accent: { hex: '#cba6f7' },
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    light: {
      background: '#eceff4',
      foreground: '#2e3440',
      accent: { hex: '#5e81ac' },
    },
    dark: {
      background: '#2e3440',
      foreground: '#d8dee9',
      accent: { hex: '#88c0d0' },
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    light: {
      background: '#fbf1c7',
      foreground: '#3c3836',
      accent: { hex: '#af3a03' },
    },
    dark: {
      background: '#282828',
      foreground: '#ebdbb2',
      accent: { hex: '#d79921' },
    },
  },
  {
    id: 'everforest',
    name: 'Everforest',
    light: {
      background: '#fdf6e3',
      foreground: '#5c6a72',
      accent: { hex: '#8da101' },
    },
    dark: {
      background: '#2d353b',
      foreground: '#d3c6aa',
      accent: { hex: '#a7c080' },
    },
  },
  {
    id: 'notion',
    name: 'Notion',
    light: {
      background: '#ffffff',
      foreground: '#37352f',
      accent: { hex: '#2383e2' },
    },
    dark: {
      background: '#191919',
      foreground: '#e6e5e3',
      accent: { hex: '#529cca' },
    },
  },
  {
    id: 'linear',
    name: 'Linear',
    light: {
      background: '#fbfbfb',
      foreground: '#282a30',
      accent: { hex: '#5e6ad2' },
    },
    dark: {
      background: '#1b1c1f',
      foreground: '#e3e4e6',
      accent: { hex: '#7170ff' },
    },
  },
];

export function findThemePreset(id: string): ThemePreset | null {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Hex shown in the `Aa` swatch for a stored accent choice. */
export function accentSwatchHex(accent: AccentChoice): string {
  if ('hex' in accent) {
    return normalizeHexColor(accent.hex) ?? '#6366f1';
  }
  const preset = ACCENT_PRESETS.find((candidate) => candidate.id === accent.presetId);
  return preset?.swatchHex ?? '#6366f1';
}

function sameChoice(left: AccentChoice, right: AccentChoice): boolean {
  if ('hex' in left && 'hex' in right) {
    return normalizeHexColor(left.hex) === normalizeHexColor(right.hex);
  }
  if ('presetId' in left && 'presetId' in right) {
    return left.presetId === right.presetId;
  }
  return false;
}

function sameColor(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return normalizeHexColor(left) === normalizeHexColor(right);
}

/** The preset whose colors match this slot, or null for a custom look. */
export function matchThemePreset(slot: ThemePresetSlot, mode: ColorMode): ThemePreset | null {
  return (
    THEME_PRESETS.find(
      (preset) =>
        sameColor(preset[mode].background, slot.background) &&
        sameColor(preset[mode].foreground, slot.foreground) &&
        sameChoice(preset[mode].accent, slot.accent),
    ) ?? null
  );
}

function slotsDiffer(preset: ThemePreset): boolean {
  return (
    preset.light.background !== preset.dark.background ||
    preset.light.foreground !== preset.dark.foreground ||
    !sameChoice(preset.light.accent, preset.dark.accent)
  );
}

/**
 * Both slots take the preset's colors; fonts and contrast are untouched. A
 * theme that ships a separate dark palette turns on separate modes, otherwise
 * its dark side would never show.
 */
export function applyThemePreset(
  appearance: AppearanceSettings,
  preset: ThemePreset,
): AppearanceSettings {
  const withSlot = (mode: ColorMode): ModeAppearance => ({
    ...appearance[mode],
    background: preset[mode].background,
    foreground: preset[mode].foreground,
    accent: preset[mode].accent,
  });
  return {
    ...appearance,
    separateModes: appearance.separateModes || slotsDiffer(preset),
    light: withSlot('light'),
    dark: withSlot('dark'),
  };
}
