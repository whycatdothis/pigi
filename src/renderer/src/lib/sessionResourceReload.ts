/**
 * Applies a package change to the sessions that are running: the same reload
 * as `/reload`, now for an idle session and after the current reply for a busy
 * one, since pi refuses to reload mid-response. Reloading the window would not
 * do it: extensions live in each session's utility process, not the renderer.
 */
import { reload } from '../services/piAgentClient';
import { isAgentBusy, useAppStore } from '../state/appStore';

const waitingSessionPaths = new Set<string>();
let unsubscribe: (() => void) | null = null;

function reloadSession(sessionPath: string, onReloaded: (sessionPath: string) => void): void {
  // A session that closed or started compacting in the meantime just keeps
  // its resources until its next /reload.
  void reload(sessionPath).then(
    () => onReloaded(sessionPath),
    () => {},
  );
}

export function reloadSessionResources(onReloaded: (sessionPath: string) => void): {
  reloaded: number;
  waiting: number;
} {
  let reloaded = 0;
  for (const [sessionPath, session] of useAppStore.getState().sessions) {
    if (isAgentBusy(session.status)) {
      waitingSessionPaths.add(sessionPath);
    } else {
      waitingSessionPaths.delete(sessionPath);
      reloadSession(sessionPath, onReloaded);
      reloaded += 1;
    }
  }
  if (waitingSessionPaths.size > 0 && !unsubscribe) {
    unsubscribe = useAppStore.subscribe((state) => {
      for (const sessionPath of waitingSessionPaths) {
        const session = state.sessions.get(sessionPath);
        if (session && isAgentBusy(session.status)) continue;
        waitingSessionPaths.delete(sessionPath);
        if (session) reloadSession(sessionPath, onReloaded);
      }
      if (waitingSessionPaths.size === 0) {
        unsubscribe?.();
        unsubscribe = null;
      }
    });
  }
  return { reloaded, waiting: waitingSessionPaths.size };
}
