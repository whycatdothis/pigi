// @vitest-environment jsdom
/**
 * The Appearance page writes through the store: what a control stores, which
 * mode slot it targets, and what reset restores. Layout and derived colors are
 * covered by the shared appearance tests; here we only follow the writes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppearanceSettings } from './appearanceSettings';
import { useSettingsStore } from '../../state/settingsStore';
import {
  DEFAULT_APPEARANCE,
  UI_FONT_SIZE_MAX,
  parseAppearance,
  type AppearanceSettings as Appearance,
} from '../../../../shared/appearance';
import { PIGI_SETTINGS_STORAGE_KEY } from '../../../../shared/pigiSettings';
import { installSystemAppearance } from '../../testing/jsdomSetup';

function storedAppearance(): Appearance {
  const raw = localStorage.getItem(PIGI_SETTINGS_STORAGE_KEY);
  if (raw === null) {
    throw new Error('Nothing persisted');
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || !('appearance' in parsed)) {
    throw new Error('Missing appearance');
  }
  return parseAppearance(parsed.appearance);
}

function seed(): void {
  installSystemAppearance({ dark: false });
  localStorage.clear();
  useSettingsStore.setState({
    version: 2,
    appearance: DEFAULT_APPEARANCE,
    chat: { toolBlockViewMode: 'compact_read' },
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
    expect(screen.getByTestId('accent-option-indigo')).toHaveAttribute('aria-pressed', 'true');
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
    expect(screen.getByText('73 · 5.0:1')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '100' } });
    expect(storedAppearance().light.contrast).toBe(100);
    expect(screen.getByText('100 · 7.0:1')).toBeInTheDocument();
  });

  it('steps the UI font size within bounds', () => {
    render(<AppearanceSettings />);
    const increase = screen.getByLabelText('Increase UI font size');
    fireEvent.click(increase);
    expect(storedAppearance().light.fonts.uiSize).toBe(DEFAULT_APPEARANCE.light.fonts.uiSize + 1);
    for (let step = 0; step < UI_FONT_SIZE_MAX; step += 1) {
      fireEvent.click(increase);
    }
    expect(storedAppearance().light.fonts.uiSize).toBe(UI_FONT_SIZE_MAX);
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
