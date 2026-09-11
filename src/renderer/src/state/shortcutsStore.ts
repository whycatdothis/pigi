/**
 * Keyboard shortcut definitions shared by the global shortcut handler and the
 * settings page. Definitions are owned by main (electron-store) and loaded
 * once; edits re-fetch so normalization stays in one place.
 */
import { create } from 'zustand';
import type { ShortcutBinding, ShortcutDefinition } from '../../../shared/ipcContract';
import { SHORTCUT_DEFAULTS } from '../../../shared/shortcutDefaults';
import { resolveShortcutBindings } from '../shortcuts/shortcutRegistry';

function defaultDefinitions(): ShortcutDefinition[] {
  return SHORTCUT_DEFAULTS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    defaultBinding: entry.defaultBinding,
    binding: entry.defaultBinding,
  }));
}

interface ShortcutsState {
  definitions: ShortcutDefinition[] | null;
  /** True while the settings page is capturing a new binding. */
  isRecording: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setRecording: (recording: boolean) => void;
  /** Returns an error message, or null on success. */
  setBinding: (id: string, binding: ShortcutBinding) => Promise<string | null>;
}

export const useShortcutsStore = create<ShortcutsState>((set, get) => {
  async function loadDefinitions(): Promise<void> {
    try {
      const definitions = await window.piApi.getShortcuts();
      set({ definitions });
    } catch (error) {
      console.error('Failed to load keyboard shortcuts:', error);
      set({ definitions: defaultDefinitions() });
    }
  }

  return {
    definitions: null,
    isRecording: false,
    load: async () => {
      if (get().definitions) {
        return;
      }
      await loadDefinitions();
    },
    refresh: loadDefinitions,
    setRecording: (isRecording) => set({ isRecording }),
    setBinding: async (id, binding) => {
      const result = await window.piApi.setShortcut(id, binding);
      if (!result.success) {
        return result.error ?? 'Failed to save the shortcut';
      }
      await loadDefinitions();
      return null;
    },
  };
});

/** Effective bindings, or null until the definitions have loaded. */
export function selectShortcutBindings(
  definitions: ShortcutDefinition[] | null,
): Map<string, ShortcutBinding> | null {
  return definitions ? resolveShortcutBindings(definitions) : null;
}
