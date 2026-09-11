/**
 * pigi's own settings store (theme, accent, default view).
 *
 * Loaded synchronously from localStorage at module init and applied to the
 * document before the first paint, so there is no theme flash. The main
 * process is not involved: these are renderer-local preferences.
 */
import { create } from 'zustand';
import {
  DEFAULT_PIGI_SETTINGS,
  PIGI_SETTINGS_STORAGE_KEY,
  parsePigiSettings,
  type PigiSettings,
  type PigiTheme,
  type ToolBlockViewMode,
} from '../../../shared/pigiSettings';
import { applyThemeAccent } from '../lib/themeAccents';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

function isSystemDark(): boolean {
  return window.matchMedia(SYSTEM_DARK_QUERY).matches;
}

function readStoredSettings(): PigiSettings {
  try {
    const raw = localStorage.getItem(PIGI_SETTINGS_STORAGE_KEY);
    return raw ? parsePigiSettings(JSON.parse(raw)) : { ...DEFAULT_PIGI_SETTINGS };
  } catch (error) {
    console.error('Failed to read pigi settings; using defaults:', error);
    return { ...DEFAULT_PIGI_SETTINGS };
  }
}

function persistSettings(settings: PigiSettings): void {
  try {
    localStorage.setItem(PIGI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to persist pigi settings:', error);
  }
}

function resolveTheme(theme: PigiTheme): 'light' | 'dark' {
  return theme === 'system' ? (isSystemDark() ? 'dark' : 'light') : theme;
}

/** Publish theme and accent to the document root. */
export function applyPigiAppearance(settings: PigiSettings): void {
  const root = document.documentElement;
  const resolved = resolveTheme(settings.theme);
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  applyThemeAccent(settings.accentId);
}

interface SettingsState extends PigiSettings {
  setTheme: (theme: PigiTheme) => void;
  setAccentId: (accentId: string) => void;
  setToolBlockViewMode: (mode: ToolBlockViewMode) => void;
}

function settingsFromState(state: PigiSettings): PigiSettings {
  return {
    theme: state.theme,
    accentId: state.accentId,
    toolBlockViewMode: state.toolBlockViewMode,
  };
}

const initialSettings = readStoredSettings();

export const useSettingsStore = create<SettingsState>((set, get) => {
  function commit(partial: Partial<PigiSettings>): void {
    const next = { ...settingsFromState(get()), ...partial };
    persistSettings(next);
    applyPigiAppearance(next);
    set(partial);
  }

  return {
    ...initialSettings,
    setTheme: (theme) => commit({ theme }),
    setAccentId: (accentId) => commit({ accentId }),
    setToolBlockViewMode: (toolBlockViewMode) => commit({ toolBlockViewMode }),
  };
});

/**
 * Apply persisted settings before render and keep the `system` theme in sync
 * with OS changes while it is selected.
 */
export function initializePigiSettings(): void {
  applyPigiAppearance(initialSettings);
  window.matchMedia(SYSTEM_DARK_QUERY).addEventListener('change', () => {
    const state = useSettingsStore.getState();
    if (state.theme === 'system') {
      applyPigiAppearance(settingsFromState(state));
    }
  });
}
