/**
 * Loads the pi settings snapshot for a project cwd and writes field updates.
 *
 * The session worker owns file I/O; this hook keeps the renderer view in sync
 * with the authoritative snapshot returned by every write.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getPiSettings, setPiSettings } from '../services/piAgentClient';
import type {
  PiSettingsScope,
  PiSettingsSnapshot,
  PiSettingUpdate,
} from '../../../shared/piSettings';

export interface PiSettingsController {
  snapshot: PiSettingsSnapshot | null;
  loading: boolean;
  saving: boolean;
  reload: () => void;
  setUpdates: (scope: PiSettingsScope, updates: PiSettingUpdate[]) => Promise<boolean>;
}

export function usePiSettings(cwd: string | null): PiSettingsController {
  const [snapshot, setSnapshot] = useState<PiSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Guards against a stale load (cwd changed, or reload clicked twice).
  const loadTokenRef = useRef(0);

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
      setSnapshot(result.snapshot);
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
    // The rAF boundary is for the react-hooks/set-state-in-effect rule: load()
    // sets loading state synchronously before its await.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const setUpdates = useCallback(
    async (scope: PiSettingsScope, updates: PiSettingUpdate[]): Promise<boolean> => {
      if (!cwd || updates.length === 0) {
        return false;
      }
      setSaving(true);
      try {
        const result = await setPiSettings(cwd, scope, updates);
        if (!result.success || !result.snapshot) {
          throw new Error(result.error ?? 'Failed to save the setting');
        }
        setSnapshot(result.snapshot);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save the setting');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [cwd],
  );

  return { snapshot, loading, saving, reload: () => void load(), setUpdates };
}
