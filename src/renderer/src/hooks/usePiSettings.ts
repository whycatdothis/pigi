/**
 * Loads the pi settings snapshot for a project cwd and writes field updates.
 *
 * The session worker owns file I/O; this hook keeps the renderer view in sync
 * with the authoritative snapshot returned by every write.
 *
 * A number stepper writes on every click, so writes are queued one at a time:
 * concurrent writes race for pi's file lock, which is not FIFO, and the file
 * could end on an older value. Each write shows up in the snapshot at once; a
 * returned snapshot, or a load, is only taken when nothing is queued, otherwise
 * it would roll the field back to a value the queue is about to replace.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getPiSettings, setPiSettings } from '../services/piAgentClient';
import type {
  PiSettingsScope,
  PiSettingsSnapshot,
  PiSettingUpdate,
} from '../../../shared/piSettings';

const SAVE_ERROR_TOAST_ID = 'pi-settings-save-error';

function applyUpdates(
  snapshot: PiSettingsSnapshot,
  scope: PiSettingsScope,
  updates: readonly PiSettingUpdate[],
): PiSettingsSnapshot {
  const values = { ...snapshot[scope] };
  for (const { field, value } of updates) {
    if (value === null) {
      delete values[field];
    } else {
      values[field] = value;
    }
  }
  return { ...snapshot, [scope]: values };
}

export interface PiSettingsController {
  snapshot: PiSettingsSnapshot | null;
  loading: boolean;
  saving: boolean;
  reload: () => void;
  setUpdates: (scope: PiSettingsScope, updates: PiSettingUpdate[]) => void;
}

export function usePiSettings(cwd: string | null): PiSettingsController {
  const [snapshot, setSnapshot] = useState<PiSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Guards against a stale load (cwd changed, or reload clicked twice).
  const loadTokenRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedWritesRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    if (!cwd) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    try {
      const result = await getPiSettings(cwd);
      if (token !== loadTokenRef.current) {
        return;
      }
      if (!result.success || !result.snapshot) {
        throw new Error(result.error ?? 'Failed to read pi settings');
      }
      if (queuedWritesRef.current === 0) {
        setSnapshot(result.snapshot);
      }
    } catch (error) {
      if (token !== loadTokenRef.current) {
        return;
      }
      setSnapshot(null);
      toast.error(error instanceof Error ? error.message : 'Failed to read pi settings');
    } finally {
      if (token === loadTokenRef.current) {
        setLoading(false);
      }
    }
  }, [cwd]);

  useEffect(() => {
    // Deferred so the effect body does not set state synchronously, which the
    // react-hooks/set-state-in-effect rule rejects; load() flips `loading` before
    // its first await. A microtask, not a frame: an occluded window does not
    // animate, and the settings would then never load at all.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void load();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const setUpdates = useCallback(
    (scope: PiSettingsScope, updates: PiSettingUpdate[]): void => {
      if (!cwd || updates.length === 0) {
        return;
      }
      setSnapshot((current) => current && applyUpdates(current, scope, updates));
      queuedWritesRef.current += 1;
      setSaving(true);
      const write = async (): Promise<void> => {
        const isLast = (): boolean => queuedWritesRef.current === 1;
        try {
          const result = await setPiSettings(cwd, scope, updates);
          if (!result.success || !result.snapshot) {
            throw new Error(result.error ?? 'Failed to save the setting');
          }
          if (isLast()) {
            setSnapshot(result.snapshot);
          }
        } catch (error) {
          // One toast for a run of failed steps, not one per click.
          toast.error(error instanceof Error ? error.message : 'Failed to save the setting', {
            id: SAVE_ERROR_TOAST_ID,
          });
          // The failed value is already on screen; read back what the file holds.
          if (isLast()) {
            void load();
          }
        } finally {
          queuedWritesRef.current -= 1;
          if (queuedWritesRef.current === 0) {
            setSaving(false);
          }
        }
      };
      writeQueueRef.current = writeQueueRef.current.then(write);
    },
    [cwd, load],
  );

  return { snapshot, loading, saving, reload: () => void load(), setUpdates };
}
