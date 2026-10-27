/**
 * Loads the pi settings snapshot for a project cwd and writes field updates.
 *
 * The session worker owns file I/O; this hook keeps the renderer view in sync
 * with the authoritative snapshot returned by every write. Writes are tracked
 * per field and scope, so a write in flight disables only the controls whose
 * fields it carries — the rest of the page stays interactive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getPiSettings, setPiSettings } from '../services/piAgentClient';
import type {
  PiSettingFieldId,
  PiSettingsScope,
  PiSettingsSnapshot,
  PiSettingUpdate,
} from '../../../shared/piSettings';

/** Both scopes a write can target, for iterating the in-flight map. */
const PI_SETTINGS_SCOPES = ['global', 'project'] as const satisfies readonly PiSettingsScope[];

/**
 * In-flight write counts per scope and field. A count rather than a set: the
 * same field can be written again before an earlier write settles (a reset
 * clicked while its control's write is still out), and the field only reads
 * idle again once every write of it has landed.
 */
type PiSettingsInFlight = Partial<
  Record<PiSettingsScope, Partial<Record<PiSettingFieldId, number>>>
>;

/** Raise or lower each field's in-flight count in one scope; keys at zero go. */
function adjustInFlight(
  current: PiSettingsInFlight,
  scope: PiSettingsScope,
  fields: readonly PiSettingFieldId[],
  change: 1 | -1,
): PiSettingsInFlight {
  const scopeCounts = { ...current[scope] };
  for (const field of fields) {
    const next = (scopeCounts[field] ?? 0) + change;
    if (next > 0) {
      scopeCounts[field] = next;
    } else {
      delete scopeCounts[field];
    }
  }
  return scope === 'global'
    ? { ...current, global: scopeCounts }
    : { ...current, project: scopeCounts };
}

export interface PiSettingsController {
  snapshot: PiSettingsSnapshot | null;
  loading: boolean;
  /** True while any write is in flight, for the page header indicator. */
  saving: boolean;
  /** True while a write of this field in this scope has not settled yet. */
  isFieldSaving: (field: PiSettingFieldId, scope: PiSettingsScope) => boolean;
  reload: () => void;
  setUpdates: (scope: PiSettingsScope, updates: PiSettingUpdate[]) => Promise<boolean>;
}

export function usePiSettings(cwd: string | null): PiSettingsController {
  const [snapshot, setSnapshot] = useState<PiSettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [inFlight, setInFlight] = useState<PiSettingsInFlight>({});
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
    async (scope: PiSettingsScope, updates: PiSettingUpdate[]): Promise<boolean> => {
      if (!cwd || updates.length === 0) {
        return false;
      }
      // Every field in the request is in flight from dispatch until the promise
      // settles, success or failure alike; nothing else loses its control.
      const fields = updates.map((update) => update.field);
      setInFlight((current) => adjustInFlight(current, scope, fields, 1));
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
        setInFlight((current) => adjustInFlight(current, scope, fields, -1));
      }
    },
    [cwd],
  );

  const isFieldSaving = useCallback(
    (field: PiSettingFieldId, scope: PiSettingsScope): boolean =>
      (inFlight[scope]?.[field] ?? 0) > 0,
    [inFlight],
  );

  // Any key in the map stands for a count of at least one, so "a scope has a
  // key" is "something is saving".
  const saving = useMemo(
    () => PI_SETTINGS_SCOPES.some((scope) => Object.keys(inFlight[scope] ?? {}).length > 0),
    [inFlight],
  );

  return { snapshot, loading, saving, isFieldSaving, reload: () => void load(), setUpdates };
}
