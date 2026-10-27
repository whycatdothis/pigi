/**
 * pigi's own settings store (appearance and chat preferences).
 *
 * The main process owns `settings.json` (see `main/pigiSettingsOwner.ts`). This
 * store reads the file synchronously through the preload at module init and
 * applies the appearance before the first paint, so there is no theme flash.
 * After that it is a client of the owner: a mutation applies locally for instant
 * feedback and sends the slice it changed; the owner's merged snapshot — the
 * reply, or the broadcast that both windows receive — replaces the local value.
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
  type PigiSettingsChange,
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

/** Set while the value read from localStorage has not reached the owner yet. */
let migratedFromLegacy = false;

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
    // the owner store it. The legacy key is dropped once the write lands, not
    // when the change is sent — a failed write must not lose the value.
    migratedFromLegacy = true;
    return legacy;
  }
  return DEFAULT_PIGI_SETTINGS;
}

/** Two appearance slices are the same look when they serialize the same. */
function looksTheSame(first: AppearanceSettings, second: AppearanceSettings): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

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
  function commit(change: PigiSettingsChange): void {
    const current = get();
    const next: PigiSettings = {
      version: PIGI_SETTINGS_VERSION,
      revision: current.revision,
      appearance: change.appearance ?? current.appearance,
      chat: change.chat ?? current.chat,
    };
    // Apply immediately: the worker round trip is short, but a dragged slider
    // must not wait for it. The owner's snapshot replaces this value below.
    if (change.appearance) {
      applyAppearance(next.appearance);
    }
    set(next);
    void window.piApi
      .changePigiSettings(change)
      .then(adoptSnapshot)
      .catch((error) => {
        console.error('Failed to persist pigi settings:', error);
        toast.error('Could not save settings. Check the app data folder for errors.');
      });
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
 * Adopts the owner's snapshot.
 *
 * A lower revision is a reply or broadcast that lost the race with a newer one
 * (the owner bumps once per change, so only two windows are needed for that), and
 * is dropped. The appearance is re-applied only when the look actually differs: a
 * chat change must not re-derive every token and re-theme every code block.
 */
function adoptSnapshot(snapshot: PigiSettings): void {
  const settings = parsePigiSettings(snapshot);
  const current = useSettingsStore.getState();
  if (settings.revision < current.revision) {
    return;
  }
  if (migratedFromLegacy) {
    // Main has the value in hand now (a revision of at least 1), so the old key
    // is redundant; dropping it earlier would lose the value if the write failed.
    migratedFromLegacy = false;
    localStorage.removeItem(PIGI_SETTINGS_STORAGE_KEY);
  }
  const appearanceChanged = !looksTheSame(settings.appearance, current.appearance);
  useSettingsStore.setState({
    version: settings.version,
    revision: settings.revision,
    appearance: settings.appearance,
    chat: settings.chat,
  });
  if (appearanceChanged) {
    applyAppearance(settings.appearance);
  }
}

// Every change — from this window or the other one — arrives here.
window.piApi.onPigiSettingsChanged(adoptSnapshot);

if (migratedFromLegacy) {
  // The file does not exist yet: hand the old localStorage value to the owner so
  // it lands on disk (and gets a revision) before anything else touches it.
  const legacy = useSettingsStore.getState();
  void window.piApi
    .changePigiSettings({ appearance: legacy.appearance, chat: legacy.chat })
    .then(adoptSnapshot)
    .catch((error) => {
      console.error('Failed to migrate the old settings:', error);
    });
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
