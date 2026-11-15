/**
 * Auto-update: the store's status comes from main's pushes, and an install the
 * user asked for has no caller left to report to — this is where that outcome
 * is said out loud.
 */
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../state/appStore';
import { MANUAL_DOWNLOAD_URL } from '../../../shared/updateWindow';
import {
  checkForUpdates,
  getUpdateStatus,
  onUpdateStatus,
  quitAndInstallUpdate,
} from '../services/piAgentClient';

export function useUpdateInstall(): {
  /** The version waiting to be installed, or null; not the whole status. */
  pendingUpdateVersion: string | null;
  checkForUpdates: () => void;
  installUpdate: () => void;
} {
  // Only the installable version, not the whole status: download progress
  // pushes on every tick, and re-rendering the app for each one is waste.
  const pendingUpdateVersion = useAppStore((state) =>
    state.updateStatus.phase === 'downloaded' || state.updateStatus.phase === 'installing'
      ? state.updateStatus.version
      : null,
  );
  /** Set when the user asked to install, so a failure can be reported. */
  const installRequestedRef = useRef(false);
  /** Set between "installing" and the status that ends it. */
  const installingRef = useRef(false);

  // Read the current status on mount (a window can open while a download is
  // already running), then follow the pushes from main.
  useEffect(() => {
    const { setUpdateStatus } = useAppStore.getState();
    // Subscribe first, and let a push win over the read: a download that starts
    // while `getStatus` is in flight would otherwise leave the dot dark until
    // the next push, up to an hour away.
    let sawPush = false;
    const unsubscribe = onUpdateStatus((status) => {
      sawPush = true;
      setUpdateStatus(status);
      if (status.phase === 'installing') {
        installingRef.current = true;
        return;
      }
      if (status.phase === 'downloaded' && installingRef.current) {
        // Main fell back from "installing" because Squirrel never finished. The
        // click led nowhere, so it must not claim the next failure either.
        installingRef.current = false;
        installRequestedRef.current = false;
        return;
      }
      // An install the user asked for has no caller left to report to: the
      // window is quit out from under it on success, and on failure the dot
      // simply disappears. Say why, once, for that case only — a background
      // check that fails (offline, GitHub down) stays silent.
      if (status.phase === 'error' && installRequestedRef.current) {
        installRequestedRef.current = false;
        installingRef.current = false;
        // A Restart fails when Squirrel rejects the new bundle (signature,
        // disk); downloading again would fail the same way.
        toast.error('Update failed', {
          description: status.message,
          action: {
            label: 'Download pigi',
            onClick: () => window.piApi.openExternal(MANUAL_DOWNLOAD_URL),
          },
        });
      } else if (installRequestedRef.current && status.phase !== 'downloaded') {
        // An install that went nowhere must not make the next unrelated failure
        // look like the install's.
        installRequestedRef.current = false;
        installingRef.current = false;
      }
    });
    void getUpdateStatus()
      .then((status) => {
        if (!sawPush) setUpdateStatus(status);
      })
      .catch((error) => console.error('Failed to read update status:', error));
    return unsubscribe;
  }, []);

  // A manual check reports its own outcome. The main process opens the progress
  // window for it, and "up to date" is announced there, so only the outcomes
  // that have no window are reported here.
  const check = useCallback(() => {
    void checkForUpdates()
      .then((status) => {
        if (status.phase === 'unsupported') {
          toast('Only the packaged app can check for updates');
        } else if (status.phase === 'error') {
          toast.error('Could not check for updates', { description: status.message });
        }
      })
      .catch((error) => console.error('Failed to check for updates:', error));
  }, []);

  const install = useCallback(() => {
    installRequestedRef.current = true;
    quitAndInstallUpdate();
  }, []);

  return { pendingUpdateVersion, checkForUpdates: check, installUpdate: install };
}
