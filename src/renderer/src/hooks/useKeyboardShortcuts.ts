import { useEffect, useMemo } from 'react';
import type { ShortcutBinding } from '../../../shared/ipcContract';
import { useShallow } from 'zustand/react/shallow';
import { selectShortcutBindings, useShortcutsStore } from '../state/shortcutsStore';
import { shortcutKeyFromEvent } from '../shortcuts/shortcutKey';

export function bindingMatches(binding: ShortcutBinding, event: KeyboardEvent): boolean {
  const key = shortcutKeyFromEvent(event);
  if (key.toLowerCase() !== binding.key.toLowerCase()) {
    return false;
  }
  if (Boolean(binding.meta) !== event.metaKey) {
    return false;
  }
  if (Boolean(binding.ctrl) !== event.ctrlKey) {
    return false;
  }
  if (Boolean(binding.shift) !== event.shiftKey) {
    return false;
  }
  if (Boolean(binding.alt) !== event.altKey) {
    return false;
  }
  return true;
}

/**
 * Register global keyboard shortcuts.
 *
 * Takes a mapping from shortcut IDs (matching those in the shortcut registry)
 * to action callbacks. Definitions come from the shared shortcuts store, so
 * edits made on the settings page take effect immediately.
 *
 * Shortcut IDs without a corresponding action are ignored.
 */
export function useKeyboardShortcuts(
  shortcutActions: Record<string, () => void>,
): Map<string, ShortcutBinding> | null {
  const { definitions, load } = useShortcutsStore(
    useShallow((state) => ({
      definitions: state.definitions,
      load: state.load,
    })),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const bindings = useMemo(() => selectShortcutBindings(definitions), [definitions]);

  useEffect(() => {
    if (!bindings) return;
    const resolvedBindings = bindings;

    function handleKeyDown(event: KeyboardEvent): void {
      // The settings shortcut recorder owns the keyboard while capturing. Read
      // at event time, not through the dependency list: subscribing would
      // rebuild the window listener every time recording starts or stops.
      if (useShortcutsStore.getState().isRecording) {
        return;
      }
      for (const [id, binding] of resolvedBindings) {
        if (bindingMatches(binding, event)) {
          const action = shortcutActions[id];
          if (action) {
            event.preventDefault();
            action();
            return;
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bindings, shortcutActions]);

  return bindings;
}
