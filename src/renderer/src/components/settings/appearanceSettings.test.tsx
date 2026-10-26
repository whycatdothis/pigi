// @vitest-environment jsdom
/**
 * The Appearance page writes through the store: what a control stores, which
 * mode slot it targets, and what reset restores. Layout and derived colors are
 * covered by the shared appearance tests; here we only follow the writes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppearanceSettings } from './appearanceSettings';
import { flushPigiSettingsWrites, useSettingsStore } from '../../state/settingsStore';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_CONTRAST,
  DEFAULT_THEME_ACCENT_ID,
  UI_FONT_SIZE_MAX,
  parseAppearance,
  type AppearanceSettings as Appearance,
} from '../../../../shared/appearance';
import { PIGI_SETTINGS_STORAGE_KEY } from '../../../../shared/pigiSettings';
import { installSystemAppearance } from '../../testing/jsdomSetup';
import { serializeTheme } from '../../../../shared/themeFile';
import {
  installPigiSettingsBridge,
  type PigiSettingsBridge,
} from '../../testing/pigiSettingsBridge';

let bridge: PigiSettingsBridge;

/** What the settings file holds now: the store debounces, so ask it to write. */
function storedAppearance(): Appearance {
  flushPigiSettingsWrites();
  const written = bridge.writes.at(-1);
  if (!written) {
    throw new Error('Nothing persisted');
  }
  return parseAppearance(written.appearance);
}

function seed(): void {
  installSystemAppearance({ dark: false });
  localStorage.clear();
  bridge = installPigiSettingsBridge();
  useSettingsStore.setState({
    version: 2,
    appearance: DEFAULT_APPEARANCE,
    chat: { toolBlockViewMode: 'compact_read', diagramTheme: 'auto' },
  });
}

/** Radix opens on pointer down, not click. */
function openThemeMenu(): void {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Theme' }), {
    button: 0,
    ctrlKey: false,
  });
}

beforeEach(() => {
  cleanup();
  seed();
});

describe('AppearanceSettings', () => {
  it('shows the mode previews and the current accent', () => {
    render(<AppearanceSettings />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByTestId('theme-option-system')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(`accent-option-${DEFAULT_THEME_ACCENT_ID}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('stores an accent preset and applies it to the document', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId('accent-option-teal'));
    expect(storedAppearance().light.accent).toEqual({ presetId: 'teal' });
    expect(document.documentElement.style.getPropertyValue('--app-system-accent')).not.toBe('');
  });

  it('stores a custom background and keeps the foreground null', () => {
    render(<AppearanceSettings />);
    const input = screen.getByLabelText('Background hex value');
    fireEvent.change(input, { target: { value: '#f6f1e8' } });
    fireEvent.blur(input);
    const appearance = storedAppearance();
    expect(appearance.light.background).toBe('#f6f1e8');
    expect(appearance.light.foreground).toBeNull();
  });

  it('shows the resolved contrast next to the slider and stores the target', () => {
    render(<AppearanceSettings />);
    const slider = screen.getByLabelText('Contrast');
    expect(screen.getByText(new RegExp(`^${DEFAULT_CONTRAST} · \\d\\.\\d:1$`))).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '100' } });
    expect(storedAppearance().light.contrast).toBe(100);
    expect(screen.getByText('100 · 7.0:1')).toBeInTheDocument();
  });

  it('types a text size and clamps it to the range', () => {
    render(<AppearanceSettings />);
    const input = screen.getByLabelText('Text size');
    fireEvent.change(input, { target: { value: '17' } });
    fireEvent.blur(input);
    expect(storedAppearance().light.fonts.uiSize).toBe(17);

    fireEvent.change(input, { target: { value: '400' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(storedAppearance().light.fonts.uiSize).toBe(UI_FONT_SIZE_MAX);
    expect(screen.getByLabelText('Text size')).toHaveValue(String(UI_FONT_SIZE_MAX));
  });

  it('edits only the selected slot when modes are separate', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Separate light and dark modes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    const input = screen.getByLabelText('Foreground hex value');
    fireEvent.change(input, { target: { value: '#d0d0d0' } });
    fireEvent.blur(input);
    const appearance = storedAppearance();
    expect(appearance.separateModes).toBe(true);
    expect(appearance.dark.foreground).toBe('#d0d0d0');
    expect(appearance.light.foreground).toBeNull();
  });

  it('copies the current appearance as a theme file', () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => written.push(text) },
    });
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy theme' }));
    expect(screen.getByRole('button', { name: 'Copy theme' })).toHaveAttribute(
      'data-copied',
      'true',
    );
    const raw: unknown = JSON.parse(written[0]);
    expect(raw).toMatchObject({ kind: 'pigi-theme', version: 1 });
  });

  it('imports a theme and reports a bad one', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Import theme' }));
    const textarea = screen.getByLabelText('Theme file contents');

    fireEvent.change(textarea, { target: { value: '{"theme":"dark"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByText('That is not a pigi theme.')).toBeInTheDocument();
    expect(useSettingsStore.getState().appearance.mode).toBe(DEFAULT_APPEARANCE.mode);
    expect(localStorage.getItem(PIGI_SETTINGS_STORAGE_KEY)).toBeNull();

    const theme = serializeTheme({
      ...DEFAULT_APPEARANCE,
      mode: 'dark',
      separateModes: true,
      light: {
        ...DEFAULT_APPEARANCE.light,
        background: '#f6f1e8',
        accent: { presetId: 'amber' },
        contrast: 55,
      },
    });
    fireEvent.change(textarea, { target: { value: theme } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const appearance = storedAppearance();
    expect(appearance.mode).toBe('dark');
    expect(appearance.separateModes).toBe(true);
    expect(appearance.light.background).toBe('#f6f1e8');
    expect(appearance.light.accent).toEqual({ presetId: 'amber' });
    expect(appearance.light.contrast).toBe(55);
    expect(screen.queryByLabelText('Theme file contents')).not.toBeInTheDocument();
  });

  it('applies a theme preset to both mode slots', () => {
    render(<AppearanceSettings />);
    openThemeMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Nord/ }));
    const appearance = storedAppearance();
    expect(appearance.light.background).toBe('#eceff4');
    expect(appearance.dark.background).toBe('#2e3440');
    expect(appearance.light.accent).toEqual({ hex: '#5e81ac' });
    expect(appearance.dark.accent).toEqual({ hex: '#88c0d0' });
    // The theme ships a dark palette, so it also turns separate modes on.
    expect(appearance.separateModes).toBe(true);
    expect(screen.getByRole('button', { name: 'Theme' })).toHaveTextContent('Nord');
  });

  it('shows Custom once a theme color is edited', () => {
    render(<AppearanceSettings />);
    openThemeMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /GitHub/ }));
    const input = screen.getByLabelText('Background hex value');
    fireEvent.change(input, { target: { value: '#101010' } });
    fireEvent.blur(input);
    expect(screen.getByRole('button', { name: 'Theme' })).toHaveTextContent('Custom');
  });

  it('resets every appearance value', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId('accent-option-blue'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }));
    const appearance = storedAppearance();
    expect(appearance.mode).toBe(DEFAULT_APPEARANCE.mode);
    expect(appearance.separateModes).toBe(false);
    expect(appearance.light.accent).toEqual(DEFAULT_APPEARANCE.light.accent);
    expect(appearance.light.contrast).toBe(DEFAULT_APPEARANCE.light.contrast);
  });
});
