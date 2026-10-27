import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, type AppearanceSettings } from './appearance';
import { THEME_FILE_KIND, parseThemeFile, serializeTheme } from './themeFile';

const CUSTOM: AppearanceSettings = {
  ...DEFAULT_APPEARANCE,
  mode: 'dark',
  separateModes: true,
  light: {
    ...DEFAULT_APPEARANCE.light,
    background: '#f6f1e8',
    foreground: '#241f1a',
    accent: { hex: '#b4552d' },
    contrast: 61,
    translucentSidebar: false,
    fonts: { ...DEFAULT_APPEARANCE.light.fonts, ui: 'Georgia', uiSize: 16 },
  },
};

describe('theme files', () => {
  it('round-trips an appearance object', () => {
    const result = parseThemeFile(serializeTheme(CUSTOM));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appearance).toEqual(CUSTOM);
  });

  it('carries the kind and version in the envelope', () => {
    const raw: unknown = JSON.parse(serializeTheme(CUSTOM));
    expect(raw).toMatchObject({ kind: THEME_FILE_KIND, version: 1 });
  });

  it('fills anything the file leaves out', () => {
    const result = parseThemeFile(
      JSON.stringify({ kind: THEME_FILE_KIND, version: 1, appearance: { mode: 'light' } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appearance.mode).toBe('light');
    expect(result.appearance.dark).toEqual(DEFAULT_APPEARANCE.dark);
  });

  it('accepts an older version', () => {
    const result = parseThemeFile(
      JSON.stringify({ kind: THEME_FILE_KIND, version: 0, appearance: { mode: 'dark' } }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects empty input, broken JSON, and foreign JSON', () => {
    expect(parseThemeFile('   ')).toEqual({ ok: false, error: 'Paste a theme first.' });
    expect(parseThemeFile('{ nope')).toEqual({ ok: false, error: 'That is not valid JSON.' });
    expect(parseThemeFile('{"theme":"dark"}')).toEqual({
      ok: false,
      error: 'That is not a pigi theme.',
    });
    expect(parseThemeFile('[1,2]')).toEqual({ ok: false, error: 'That is not a pigi theme.' });
  });

  it('rejects a theme from a newer pigi or without a payload', () => {
    expect(
      parseThemeFile(JSON.stringify({ kind: THEME_FILE_KIND, version: 99, appearance: {} })),
    ).toEqual({ ok: false, error: 'This theme was made by a newer version of pigi.' });
    expect(parseThemeFile(JSON.stringify({ kind: THEME_FILE_KIND, version: 1 }))).toEqual({
      ok: false,
      error: 'The theme has no appearance settings.',
    });
  });
});
