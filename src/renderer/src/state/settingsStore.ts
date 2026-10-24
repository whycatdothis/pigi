/**
 * pigi's own settings store (appearance and chat preferences).
 *
 * Loaded synchronously from localStorage at module init and applied to the
 * document before the first paint, so there is no theme flash. The main
 * process is not involved: these are renderer-local preferences.
 *
 * The store holds the persisted shape and exposes narrow setters. Every
 * mutation goes through `commit`, which persists the full settings object and
 * re-applies appearance once.
 */
import { create } from 'zustand';
import {
  DEFAULT_PIGI_SETTINGS,
  PIGI_SETTINGS_STORAGE_KEY,
  parsePigiSettings,
  type PigiSettings,
  type ToolBlockViewMode,
} from '../../../shared/pigiSettings';
import {
  DEFAULT_APPEARANCE,
  type AccentChoice,
  type AppearanceSettings,
  type ColorMode,
  type ModeAppearance,
  type ThemeMode,
} from '../../../shared/appearance';
import { applyAppearance, currentColorMode } from '../appearance/applyAppearance';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';
const SYSTEM_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readStoredSettings(): PigiSettings {
  try {
    const raw = localStorage.getItem(PIGI_SETTINGS_STORAGE_KEY);
    return raw ? parsePigiSettings(JSON.parse(raw)) : DEFAULT_PIGI_SETTINGS;
  } catch (error) {
    console.error('Failed to read pigi settings; using defaults:', error);
    return DEFAULT_PIGI_SETTINGS;
  }
}

function persistSettings(settings: PigiSettings): void {
  try {
    localStorage.setItem(PIGI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to persist pigi settings:', error);
  }
}

interface SettingsState extends PigiSettings {
  setMode: (mode: ThemeMode) => void;
  /** Edits the active mode's slot unless `mode` is given. */
  setAccent: (accent: AccentChoice, mode?: ColorMode) => void;
  setToolBlockViewMode: (mode: ToolBlockViewMode) => void;
  updateAppearance: (updater: (appearance: AppearanceSettings) => AppearanceSettings) => void;
  resetAppearance: () => void;
}

const initialSettings = readStoredSettings();

export const useSettingsStore = create<SettingsState>((set, get) => {
  function commit(partial: Partial<PigiSettings>): void {
    const current = get();
    const next: PigiSettings = {
      version: 2,
      appearance: partial.appearance ?? current.appearance,
      chat: partial.chat ?? current.chat,
    };
    persistSettings(next);
    applyAppearance(next.appearance);
    set(next);
  }

  function updateSlot(
    mode: ColorMode | undefined,
    updater: (slot: ModeAppearance) => ModeAppearance,
  ): void {
    const appearance = get().appearance;
    const targetMode = mode ?? (appearance.separateModes ? currentColorMode(appearance) : 'light');
    const nextAppearance: AppearanceSettings = {
      ...appearance,
      [targetMode]: updater(appearance[targetMode]),
    };
    commit({ appearance: nextAppearance });
  }

  return {
    ...initialSettings,
    setMode: (mode) => commit({ appearance: { ...get().appearance, mode } }),
    setAccent: (accent, mode) => updateSlot(mode, (slot) => ({ ...slot, accent })),
    setToolBlockViewMode: (toolBlockViewMode) => commit({ chat: { toolBlockViewMode } }),
    updateAppearance: (updater) => commit({ appearance: updater(get().appearance) }),
    resetAppearance: () => commit({ appearance: DEFAULT_APPEARANCE }),
  };
});

/** Current mode whose slot the settings page edits. */
export function activeAppearanceMode(): ColorMode {
  const appearance = useSettingsStore.getState().appearance;
  return appearance.separateModes ? currentColorMode(appearance) : 'light';
}

/**
 * Apply persisted settings before render and keep `system` choices in sync
 * with the OS while they are selected.
 */
export function initializePigiSettings(): void {
  const apply = (): void => {
    applyAppearance(useSettingsStore.getState().appearance);
  };
  let lastMode = useSettingsStore.getState().appearance.mode;
  const syncNativeTheme = (): void => {
    window.piApi.setAppearanceTheme(lastMode);
  };

  apply();
  syncNativeTheme();

  // The window material, native menus, and the renderer's own
  // prefers-color-scheme follow the chosen mode, not only the OS.
  useSettingsStore.subscribe((state) => {
    if (state.appearance.mode !== lastMode) {
      lastMode = state.appearance.mode;
      syncNativeTheme();
    }
  });

  // Keep the lists referenced: a listener attached to an unreferenced
  // MediaQueryList can be collected, and then the change never arrives.
  const darkQuery = window.matchMedia(SYSTEM_DARK_QUERY);
  const reducedMotionQuery = window.matchMedia(SYSTEM_REDUCED_MOTION_QUERY);

  // The main process flips `nativeTheme` in response to a mode change, so the
  // query updates a moment after the store did; re-apply on the next frame.
  darkQuery.addEventListener('change', () => {
    if (useSettingsStore.getState().appearance.mode === 'system') {
      window.requestAnimationFrame(apply);
    }
  });
  reducedMotionQuery.addEventListener('change', () => {
    if (useSettingsStore.getState().appearance.reduceMotion === 'system') {
      window.requestAnimationFrame(apply);
    }
  });

  // Re-apply once the environment is known to be stable (the first call can
  // run before the window reports its final appearance).
  window.requestAnimationFrame(() => {
    if (useSettingsStore.getState().appearance.mode === 'system') {
      apply();
    }
  });
}
