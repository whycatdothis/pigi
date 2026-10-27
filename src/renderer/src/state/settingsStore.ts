/**
 * pigi's own settings store (appearance and chat preferences).
 *
 * Persisted to `settings.json` in the app's user data directory, read
 * synchronously through the preload at module init and applied to the document
 * before the first paint, so there is no theme flash. The preload reads the
 * file itself instead of an async round trip for exactly that reason.
 *
 * The store holds the persisted shape and exposes narrow setters. Every
 * mutation goes through `commit`, which queues the full settings object for the
 * file and re-applies appearance once.
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import {
  DEFAULT_PIGI_SETTINGS,
  PIGI_SETTINGS_READ_STATE,
  PIGI_SETTINGS_STORAGE_KEY,
  PIGI_SETTINGS_VERSION,
  parsePigiSettings,
  type PigiSettings,
  type ToolBlockViewMode,
} from '../../../shared/pigiSettings';
import type { DiagramThemeChoice } from '../../../shared/diagramTheme';
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type ThemeMode,
} from '../../../shared/appearance';
import { applyAppearance } from '../appearance/applyAppearance';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';
const SYSTEM_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The value stored before settings moved to a file, read once to migrate. */
function readLegacySettings(): PigiSettings | null {
  try {
    const raw = localStorage.getItem(PIGI_SETTINGS_STORAGE_KEY);
    return raw ? parsePigiSettings(JSON.parse(raw)) : null;
  } catch (error) {
    console.error('Failed to read the old localStorage settings:', error);
    return null;
  }
}

function readStoredSettings(): PigiSettings {
  const stored = window.piApi.readPigiSettings();
  if (stored.state === PIGI_SETTINGS_READ_STATE.ok) {
    return parsePigiSettings(stored.settings);
  }
  if (stored.state === PIGI_SETTINGS_READ_STATE.corrupt) {
    // Unreadable, not absent: keep the file as it is so it can be repaired by
    // hand, and start from the defaults instead of overwriting it with a stale
    // localStorage value.
    return DEFAULT_PIGI_SETTINGS;
  }
  const legacy = readLegacySettings();
  if (legacy) {
    // First launch after the switch to a file: keep what the user had and let
    // the normal debounced writer put it on disk. Going through that path is
    // what keeps this value from landing *after* a setting the reader changes in
    // the first second and overwriting it — both would be separate writes.
    migratedFromLegacy = true;
    persistSettings(legacy);
    return legacy;
  }
  return DEFAULT_PIGI_SETTINGS;
}

/** Dragging the contrast slider commits per frame; the file does not need that. */
const PERSIST_DEBOUNCE_MS = 150;

let queuedSettings: PigiSettings | null = null;
let persistTimer: number | null = null;

/** Set while the value read from localStorage has not reached the file yet. */
let migratedFromLegacy = false;

/** Writes the queued settings now. Called on page hide, and by tests. */
export function flushPigiSettingsWrites(): void {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  const settings = queuedSettings;
  queuedSettings = null;
  if (!settings) {
    return;
  }
  void window.piApi
    .writePigiSettings(settings)
    .then((written) => {
      if (!written) {
        toast.error('Could not save settings. Check the app data folder for errors.');
      } else if (migratedFromLegacy) {
        // The file exists now, so the old key is redundant. Dropping it earlier
        // would lose the value if the write had failed.
        migratedFromLegacy = false;
        localStorage.removeItem(PIGI_SETTINGS_STORAGE_KEY);
      }
    })
    .catch((error) => {
      console.error('Failed to persist pigi settings:', error);
      toast.error('Could not save settings.');
    });
}

function persistSettings(settings: PigiSettings): void {
  queuedSettings = settings;
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
  }
  persistTimer = window.setTimeout(flushPigiSettingsWrites, PERSIST_DEBOUNCE_MS);
}

// Quitting right after a change must not drop it: the debounce window is short,
// but the last 150ms would still be lost.
window.addEventListener('pagehide', flushPigiSettingsWrites);

interface SettingsState extends PigiSettings {
  setMode: (mode: ThemeMode) => void;
  setToolBlockViewMode: (mode: ToolBlockViewMode) => void;
  setCodeTheme: (codeTheme: string) => void;
  setDiagramTheme: (choice: DiagramThemeChoice) => void;
  updateAppearance: (updater: (appearance: AppearanceSettings) => AppearanceSettings) => void;
  resetAppearance: () => void;
}

const initialSettings = readStoredSettings();

export const useSettingsStore = create<SettingsState>((set, get) => {
  function commit(partial: Partial<PigiSettings>): void {
    const current = get();
    const next: PigiSettings = {
      version: PIGI_SETTINGS_VERSION,
      appearance: partial.appearance ?? current.appearance,
      chat: partial.chat ?? current.chat,
    };
    persistSettings(next);
    // Only an appearance commit re-derives tokens and notifies every subscriber;
    // a chat-only change would otherwise rewrite the whole token set and make
    // each code block and terminal re-theme for nothing.
    if (partial.appearance) {
      applyAppearance(next.appearance);
    }
    set(next);
  }

  return {
    ...initialSettings,
    setMode: (mode) => commit({ appearance: { ...get().appearance, mode } }),
    setToolBlockViewMode: (toolBlockViewMode) =>
      commit({ chat: { ...get().chat, toolBlockViewMode } }),
    setCodeTheme: (codeTheme) => commit({ appearance: { ...get().appearance, codeTheme } }),
    setDiagramTheme: (diagramTheme) =>
      commit({ appearance: { ...get().appearance, diagramTheme } }),
    updateAppearance: (updater) => commit({ appearance: updater(get().appearance) }),
    resetAppearance: () => commit({ appearance: DEFAULT_APPEARANCE }),
  };
});

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
