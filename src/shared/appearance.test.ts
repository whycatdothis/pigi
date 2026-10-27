import { describe, expect, it } from 'vitest';
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  DEFAULT_CONTRAST,
  DEFAULT_THEME_ACCENT_ID,
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
    expect(parsed.light.accent).toEqual({ presetId: DEFAULT_THEME_ACCENT_ID });
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
  it('keeps the fill white-labelled and the text accent legible in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const preset of ACCENT_PRESETS) {
        const tokens = tokensFor({ mode, accent: { presetId: preset.id } });
        const fill = color(tokens['--app-primary']);
        const label = color(tokens['--app-primary-foreground']);
        const textAccent = color(tokens['--app-system-accent']);
        const background = color(tokens['--app-background']);

        // Solid buttons read the same in every theme: white label on the
        // fill, never a flipped black label that would change their weight.
        expect(label.lightness).toBeGreaterThan(0.95);
        expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(4.5);
        // The fill only has to separate from the page (non-text floor).
        expect(contrastRatio(fill, background)).toBeGreaterThanOrEqual(3);
        // Text, icons and rails use their own value, which clears AA.
        expect(contrastRatio(textAccent, background)).toBeGreaterThanOrEqual(4.5);
        expect(tokens['--app-sidebar-primary']).toBe(tokens['--app-primary']);
        expect(tokens['--app-ring']).toBe(tokens['--app-system-accent']);
      }
    }
  });

  it('keeps the fill labelled on a mid-tone page', () => {
    // A user-set mid-tone background is where the two rules collide: the fill has
    // to move away from the page to keep its 3:1 separation, ends up light, and a
    // white label on it reads at 1.73:1 (#6b6b6b) to 3.72:1 (#3a3a3a). The label
    // flips and the fill is walked until it reads, instead of either floor giving
    // way.
    for (const mode of ['light', 'dark'] as const) {
      for (const backgroundHex of ['#6b6b6b', '#555555', '#3a3a3a', '#808080']) {
        for (const preset of ACCENT_PRESETS) {
          const tokens = tokensFor({
            mode,
            background: backgroundHex,
            accent: { presetId: preset.id },
          });
          const background = color(tokens['--app-background']);
          const fill = color(tokens['--app-primary']);
          const label = color(tokens['--app-primary-foreground']);

          expect(contrastRatio(fill, background)).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(4.5);
          expect(tokens['--app-sidebar-primary-foreground']).toBe(
            tokens['--app-primary-foreground'],
          );
        }
      }
    }
  });

  it('lifts the text accent above the fill in dark mode', () => {
    const tokens = tokensFor({ mode: 'dark' });
    // The fill stays dark enough for a white label; only the text accent is
    // lifted, which is the whole point of not sharing one value.
    expect(color(tokens['--app-system-accent']).lightness).toBeGreaterThan(
      color(tokens['--app-primary']).lightness,
    );
    expect(color(tokens['--app-primary']).lightness).toBeLessThanOrEqual(0.6);
  });

  it('clamps a hand-picked accent into both bands', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const hex of ['#facc15', '#7c3aed', '#ffffff', '#00ff00']) {
        const tokens = tokensFor({ mode, accent: { hex } });
        const fill = color(tokens['--app-primary']);
        const textAccent = color(tokens['--app-system-accent']);
        const background = color(tokens['--app-background']);

        expect(fill.chroma).toBeLessThanOrEqual(0.22);
        expect(textAccent.chroma).toBeLessThanOrEqual(0.22);
        expect(
          contrastRatio(color(tokens['--app-primary-foreground']), fill),
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(textAccent, background)).toBeGreaterThanOrEqual(4.5);
        expect(color(tokens['--app-primary-hover']).lightness).not.toBeCloseTo(fill.lightness, 3);
      }
    }
  });

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
              color(tokens['--app-primary-foreground']),
              color(tokens['--app-primary']),
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
    expect(parsed.appearance.diagramTheme).toBe('default');
  });

  it('keeps a known diagram theme and drops an unknown one', () => {
    const read = (diagramTheme: unknown): string =>
      parsePigiSettings({ version: 2, appearance: { diagramTheme } }).appearance.diagramTheme;
    expect(read('forest')).toBe('forest');
    expect(read('solarized')).toBe('default');
    // `auto` was a real choice before the picker dropped it.
    expect(read('auto')).toBe('default');
  });

  it('adopts a diagram theme stored under chat', () => {
    const parsed = parsePigiSettings({ version: 2, chat: { diagramTheme: 'neutral' } });
    expect(parsed.appearance.diagramTheme).toBe('neutral');
    // The appearance value wins once it exists.
    const explicit = parsePigiSettings({
      version: 2,
      appearance: { diagramTheme: 'forest' },
      chat: { diagramTheme: 'neutral' },
    });
    expect(explicit.appearance.diagramTheme).toBe('forest');
  });

  it('keeps a known code theme and drops an unknown one', () => {
    const read = (codeTheme: unknown): string =>
      parsePigiSettings({ version: 2, appearance: { codeTheme } }).appearance.codeTheme;
    expect(read('nord')).toBe('nord');
    expect(read('not-a-theme')).toBe('one');
  });

  it('falls back per field when v1 values are invalid', () => {
    const migrated = parsePigiSettings({ theme: 'chartreuse', accentId: 42 });
    expect(migrated.appearance.mode).toBe(DEFAULT_APPEARANCE.mode);
    expect(migrated.appearance.light.accent).toEqual({ presetId: DEFAULT_THEME_ACCENT_ID });
  });
});
