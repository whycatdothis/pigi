import { useCallback, useEffect, useState } from 'react';
import { IconPencil } from '@tabler/icons-react';
import { toast } from 'sonner';
import type { ShortcutBinding, ShortcutDefinition } from '../../../../shared/ipcContract';
import { useShortcutsStore } from '../../state/shortcutsStore';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { shortcutKeyFromEvent } from '../../shortcuts/shortcutKey';
import { COMPACT_KBD_CLASS_NAME, Kbd } from '../ui/kbd';
import { Button } from '../ui/button';
import { SettingsGroup, SettingsHint, SettingsRow } from './settingsControls';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS']);

function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    Boolean(a.meta) === Boolean(b.meta) &&
    Boolean(a.ctrl) === Boolean(b.ctrl) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

function isOverridden(definition: ShortcutDefinition): boolean {
  return !bindingsEqual(definition.binding, definition.defaultBinding);
}

export function ShortcutsSettings(): React.JSX.Element {
  const definitions = useShortcutsStore((state) => state.definitions);
  const loadShortcuts = useShortcutsStore((state) => state.load);
  const setBinding = useShortcutsStore((state) => state.setBinding);
  const setRecording = useShortcutsStore((state) => state.setRecording);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<{ id: string; message: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void loadShortcuts();
  }, [loadShortcuts]);

  // Keep the global shortcut handler quiet while capturing.
  useEffect(() => {
    setRecording(recordingId !== null);
    return () => setRecording(false);
  }, [recordingId, setRecording]);

  const saveBinding = useCallback(
    async (id: string, binding: ShortcutBinding) => {
      setSavingId(id);
      const error = await setBinding(id, binding);
      setSavingId(null);
      setRecordingId(null);
      setCaptureError(null);
      if (error) {
        toast.error(error);
      }
    },
    [setBinding],
  );

  useEffect(() => {
    if (!recordingId) {
      return;
    }
    const capturingId = recordingId;

    function handleKeyDown(event: KeyboardEvent): void {
      // Own the keyboard: neither the global shortcuts nor the page close
      // handler may react to the captured keys.
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === 'Escape') {
        setRecordingId(null);
        setCaptureError(null);
        return;
      }
      if (MODIFIER_KEYS.has(event.key)) {
        return;
      }
      const definition = definitions?.find((entry) => entry.id === capturingId);
      if (!definition) {
        setRecordingId(null);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        void saveBinding(capturingId, definition.defaultBinding);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        setCaptureError({
          id: capturingId,
          message: 'Add ⌘, ⌃, or ⌥ to avoid typing collisions.',
        });
        return;
      }

      const binding: ShortcutBinding = {
        key: shortcutKeyFromEvent(event),
        ...(event.metaKey ? { meta: true } : {}),
        ...(event.ctrlKey ? { ctrl: true } : {}),
        ...(event.shiftKey ? { shift: true } : {}),
        ...(event.altKey ? { alt: true } : {}),
      };
      const conflict = definitions?.find(
        (entry) => entry.id !== capturingId && bindingsEqual(entry.binding, binding),
      );
      if (conflict) {
        setCaptureError({ id: capturingId, message: `Already used by “${conflict.label}”.` });
        return;
      }
      void saveBinding(capturingId, binding);
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingId, definitions, saveBinding]);

  const openSettingsDefinition = definitions?.find((entry) => entry.id === 'settings.open');

  return (
    <>
      <SettingsGroup title="Keyboard shortcuts">
        {definitions === null && (
          <SettingsRow label="Loading shortcuts…">
            <span />
          </SettingsRow>
        )}
        {definitions?.map((definition) => {
          const isCapturing = recordingId === definition.id;
          const error = captureError?.id === definition.id ? captureError.message : null;
          return (
            <SettingsRow
              key={definition.id}
              label={definition.label}
              description={error ?? undefined}
              hint={
                isOverridden(definition) && !isCapturing ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    disabled={savingId === definition.id}
                    onClick={() => void saveBinding(definition.id, definition.defaultBinding)}
                  >
                    Reset
                  </button>
                ) : null
              }
            >
              {isCapturing ? (
                <span className="rounded-md border border-dashed border-foreground/30 px-3 py-1 font-mono text-xs text-muted-foreground">
                  Press shortcut… (Esc cancels)
                </span>
              ) : (
                <>
                  <Kbd className="min-w-14 justify-center border border-foreground/10 px-2 whitespace-nowrap">
                    {formatShortcutLabel(definition.binding)}
                  </Kbd>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Change ${definition.label}`}
                    disabled={savingId === definition.id}
                    onClick={() => {
                      setCaptureError(null);
                      setRecordingId(definition.id);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <IconPencil />
                  </Button>
                </>
              )}
            </SettingsRow>
          );
        })}
      </SettingsGroup>
      <SettingsHint>
        Changes apply immediately and are stored per user. Backspace clears a shortcut while
        recording; Esc cancels.
        {openSettingsDefinition && (
          /* The shortcut for this page reads as a keycap here, like everywhere else. */
          <>
            {' '}
            <Kbd className={`${COMPACT_KBD_CLASS_NAME} mx-0.5 align-middle`}>
              {formatShortcutLabel(openSettingsDefinition.binding)}
            </Kbd>{' '}
            opens this page from anywhere.
          </>
        )}
      </SettingsHint>
    </>
  );
}
