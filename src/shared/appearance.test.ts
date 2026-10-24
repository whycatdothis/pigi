import { describe, expect, it } from 'vitest';
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  DEFAULT_CONTRAST,
  DEFAULT_MODE_APPEARANCE,
  parseAppearance,
  type AppearanceSettings,
} from './appearance';
import { deriveTokens, resolveAppearance, contrastTargets } from './appearanceTokens';
import { contrastRatio, parseCssColor, type OklchColor } from './colorMath';
import { DEFAULT_PIGI_SETTINGS, parsePigiSettings } from './pigiSettings';

function color(value: string | undefined): OklchColor {
  if (value === undefined) {
    throw new Error('Missing token');
  }
  const parsed = parseCssColor(value);
  if (!parsed) {
    throw new Error(`Unparseable token: ${value}`);
  }
  return parsed;
}

function tokensFor(
  overrides: {
    mode?: 'light' | 'dark';
    contrast?: number;
    background?: string | null;
    foreground?: string | null;
    accent?: { presetId: string } | { hex: string };
    separateModes?: boolean;
  } = {},
): Record<string, string> {
  const mode = overrides.mode ?? 'light';
  const base = DEFAULT_MODE_APPEARANCE[mode];
  const settings: AppearanceSettings = {
    ...DEFAULT_APPEARANCE,
    mode,
    separateModes: overrides.separateModes ?? false,
    light: {
      ...base,
      contrast: overrides.contrast ?? base.contrast,
      background: overrides.background ?? null,
      foreground: overrides.foreground ?? null,
      accent: overrides.accent ?? base.accent,
    },
    dark: {
      ...DEFAULT_MODE_APPEARANCE.dark,
      contrast: overrides.contrast ?? DEFAULT_MODE_APPEARANCE.dark.contrast,
      accent: overrides.accent ?? DEFAULT_MODE_APPEARANCE.dark.accent,
    },
  };
  const resolved = resolveAppearance(settings, {
    systemIsDark: mode === 'dark',
    systemPrefersReducedMotion: false,
  });
  return deriveTokens(resolved);
}

describe('parseAppearance', () => {
  it('returns the defaults for junk input', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('nope')).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps valid fields and repairs invalid ones', () => {
    const parsed = parseAppearance({
      mode: 'dark',
      separateModes: true,
      light: { contrast: 999, accent: { presetId: 'nope' } },
      dark: { background: '#101010', fonts: { uiSize: 2 } },
      reduceMotion: 'sometimes',
    });
    expect(parsed.mode).toBe('dark');
    expect(parsed.separateModes).toBe(true);
    expect(parsed.light.contrast).toBe(100);
    expect(parsed.light.accent).toEqual({ presetId: 'indigo' });
    expect(parsed.dark.background).toBe('#101010');
    expect(parsed.dark.fonts.uiSize).toBe(12);
    expect(parsed.reduceMotion).toBe('system');
  });
});

describe('resolveAppearance', () => {
  const environment = { systemIsDark: true, systemPrefersReducedMotion: false };

  it('follows the system when mode is system', () => {
    expect(resolveAppearance(DEFAULT_APPEARANCE, environment).mode).toBe('dark');
  });

  it('shares the light slot until separate modes are on', () => {
    const shared: AppearanceSettings = {
      ...DEFAULT_APPEARANCE,
      mode: 'dark',
      separateModes: false,
      light: { ...DEFAULT_APPEARANCE.light, contrast: 20 },
      dark: { ...DEFAULT_APPEARANCE.dark, contrast: 90 },
    };
    expect(resolveAppearance(shared, environment).slot.contrast).toBe(20);

    const separate: AppearanceSettings = { ...shared, separateModes: true };
    expect(resolveAppearance(separate, environment).slot.contrast).toBe(90);
  });

  it('resolves reduce motion against the system preference', () => {
    const prefersReduced = { systemIsDark: false, systemPrefersReducedMotion: true };
    expect(resolveAppearance(DEFAULT_APPEARANCE, prefersReduced).reduceMotion).toBe(true);
    expect(
      resolveAppearance({ ...DEFAULT_APPEARANCE, reduceMotion: 'off' }, prefersReduced)
        .reduceMotion,
    ).toBe(false);
    expect(
      resolveAppearance({ ...DEFAULT_APPEARANCE, reduceMotion: 'on' }, prefersReduced).reduceMotion,
    ).toBe(true);
  });
});

describe('deriveTokens', () => {
  it('keeps the documented default palette', () => {
    for (const mode of ['light', 'dark'] as const) {
      const tokens = tokensFor({ mode });
      const background = color(tokens['--app-background']);
      const foreground = color(tokens['--app-foreground']);
      const muted = color(tokens['--app-muted-foreground']);
      const border = color(tokens['--app-border']);

      expect(contrastRatio(foreground, background)).toBeGreaterThan(7);
      expect(contrastRatio(muted, background)).toBeCloseTo(
        contrastTargets(DEFAULT_CONTRAST, mode).secondaryText,
        1,
      );
      expect(contrastRatio(border, background)).toBeCloseTo(
        contrastTargets(DEFAULT_CONTRAST, mode).border,
        1,
      );
    }
  });

  it('meets the contrast floors for every preset, mode, and slider position', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const contrast of [0, 73, 100]) {
        for (const preset of ACCENT_PRESETS) {
          const tokens = tokensFor({ mode, contrast, accent: { presetId: preset.id } });
          const background = color(tokens['--app-background']);
          const targets = contrastTargets(contrast, mode);

          expect(contrastRatio(color(tokens['--app-foreground']), background)).toBeGreaterThan(6.9);
          expect(
            contrastRatio(color(tokens['--app-muted-foreground']), background),
          ).toBeGreaterThanOrEqual(targets.secondaryText - 0.05);
          expect(contrastRatio(color(tokens['--app-system-accent']), background)).toBeGreaterThan(
            4.4,
          );
          expect(
            contrastRatio(
              color(tokens['--app-system-accent-foreground']),
              color(tokens['--app-system-accent']),
            ),
          ).toBeGreaterThan(4.4);
          expect(contrastRatio(color(tokens['--app-border']), background)).toBeGreaterThanOrEqual(
            targets.border - 0.02,
          );
          for (const status of ['success', 'warning', 'danger', 'info']) {
            expect(contrastRatio(color(tokens[`--app-${status}-fg`]), background)).toBeGreaterThan(
              4.4,
            );
          }
        }
      }
    }
  });

  it('hits the foreground floor on custom backgrounds where it is reachable', () => {
    for (const background of ['#ffffff', '#f6f1e8', '#1f2430'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const tokens = tokensFor({ mode, background });
        const parsedBackground = color(background);
        expect(
          contrastRatio(color(tokens['--app-foreground']), parsedBackground),
        ).toBeGreaterThanOrEqual(6.9);
        expect(
          contrastRatio(color(tokens['--app-system-accent']), parsedBackground),
        ).toBeGreaterThan(3.9);
      }
    }
  });

  it('falls back to the best available extreme on a mid-tone background', () => {
    // #808080 cannot reach 7:1 against any color; the engine must still pick
    // the stronger of black and white instead of a half-step.
    const parsedBackground = color('#808080');
    for (const mode of ['light', 'dark'] as const) {
      const tokens = tokensFor({ mode, background: '#808080' });
      const foreground = color(tokens['--app-foreground']);
      expect(contrastRatio(foreground, parsedBackground)).toBeGreaterThan(4.4);
      expect(foreground.lightness === 0 || foreground.lightness === 1).toBe(true);
    }
  });

  it('moves borders monotonically with the contrast slider', () => {
    const low = tokensFor({ contrast: 0 });
    const medium = tokensFor({ contrast: 73 });
    const high = tokensFor({ contrast: 100 });
    const background = color(low['--app-background']);
    const ratios = [low, medium, high].map((tokens) =>
      contrastRatio(color(tokens['--app-border']), background),
    );
    expect(ratios[0]).toBeLessThan(ratios[1]);
    expect(ratios[1]).toBeLessThan(ratios[2]);
  });

  it('drops the sidebar alpha when translucency is off', () => {
    const base = DEFAULT_APPEARANCE;
    const settings: AppearanceSettings = {
      ...base,
      mode: 'light',
      light: { ...base.light, translucentSidebar: false },
    };
    const tokens = deriveTokens(
      resolveAppearance(settings, { systemIsDark: false, systemPrefersReducedMotion: false }),
    );
    expect(tokens['--app-sidebar']).not.toContain('transparent');
  });
});

describe('parsePigiSettings', () => {
  it('returns defaults for junk', () => {
    expect(parsePigiSettings(null)).toEqual(DEFAULT_PIGI_SETTINGS);
  });

  it('migrates v1 theme, accent, and tool view mode', () => {
    const migrated = parsePigiSettings({
      theme: 'dark',
      accentId: 'teal',
      toolBlockViewMode: 'minimal',
    });
    expect(migrated.version).toBe(2);
    expect(migrated.appearance.mode).toBe('dark');
    expect(migrated.appearance.separateModes).toBe(false);
    expect(migrated.appearance.light.accent).toEqual({ presetId: 'teal' });
    expect(migrated.appearance.dark.accent).toEqual({ presetId: 'teal' });
    expect(migrated.chat.toolBlockViewMode).toBe('minimal');
  });

  it('reads v2 blobs back', () => {
    const stored = {
      version: 2,
      appearance: { mode: 'light', light: { background: '#f6f1e8' } },
      chat: { toolBlockViewMode: 'default' },
    };
    const parsed = parsePigiSettings(stored);
    expect(parsed.appearance.light.background).toBe('#f6f1e8');
    expect(parsed.appearance.mode).toBe('light');
    expect(parsed.chat.toolBlockViewMode).toBe('default');
  });

  it('falls back per field when v1 values are invalid', () => {
    const migrated = parsePigiSettings({ theme: 'chartreuse', accentId: 42 });
    expect(migrated.appearance.mode).toBe(DEFAULT_APPEARANCE.mode);
    expect(migrated.appearance.light.accent).toEqual({ presetId: 'indigo' });
  });
});
