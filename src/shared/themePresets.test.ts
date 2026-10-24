import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { contrastRatio, parseCssColor } from './colorMath';
import {
  DEFAULT_THEME_PRESET_ID,
  THEME_PRESETS,
  applyThemePreset,
  matchThemePreset,
  type ThemePreset,
} from './themePresets';

function ratio(foreground: string | null, background: string | null): number | null {
  if (foreground === null || background === null) return null;
  const first = parseCssColor(foreground);
  const second = parseCssColor(background);
  if (first === null || second === null) return null;
  return contrastRatio(first, second);
}

function findPreset(id: string): ThemePreset {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`Missing preset ${id}`);
  return preset;
}

describe('theme presets', () => {
  it('keeps every palette readable in both modes', () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const value = ratio(preset[mode].foreground, preset[mode].background);
        if (value === null) continue;
        expect(value, `${preset.name} ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('applies both slots and turns separate modes on for a paired theme', () => {
    const next = applyThemePreset(DEFAULT_APPEARANCE, findPreset('nord'));
    expect(next.light.background).toBe('#eceff4');
    expect(next.dark.background).toBe('#2e3440');
    expect(next.separateModes).toBe(true);
    // Fonts and contrast are the user's, not the theme's.
    expect(next.light.fonts).toEqual(DEFAULT_APPEARANCE.light.fonts);
    expect(next.light.contrast).toBe(DEFAULT_APPEARANCE.light.contrast);
  });

  it('leaves separate modes alone for the default theme', () => {
    const next = applyThemePreset(
      { ...DEFAULT_APPEARANCE, separateModes: false },
      findPreset(DEFAULT_THEME_PRESET_ID),
    );
    expect(next.separateModes).toBe(false);
  });

  it('matches a slot back to its preset per mode, and to Custom otherwise', () => {
    const applied = applyThemePreset(DEFAULT_APPEARANCE, findPreset('gruvbox'));
    expect(matchThemePreset(applied.light, 'light')?.id).toBe('gruvbox');
    expect(matchThemePreset(applied.dark, 'dark')?.id).toBe('gruvbox');
    expect(matchThemePreset(DEFAULT_APPEARANCE.light, 'light')?.id).toBe(DEFAULT_THEME_PRESET_ID);
    expect(matchThemePreset({ ...applied.light, foreground: '#123456' }, 'light')).toBeNull();
  });
});
