import type { PiSessionInfo } from '../../../shared/ipcContract';
import { isSessionFileRef } from '../../../shared/remoteCommandContract';

/**
 * The sessions a CLI session argument names: its file, its exact id, or every
 * session whose id starts with it. More than one is for the caller to refuse;
 * picking one would act on a session nobody named.
 */
export function matchSessions(ref: string, sessions: readonly PiSessionInfo[]): PiSessionInfo[] {
  if (isSessionFileRef(ref)) return sessions.filter((session) => session.path === ref).slice(0, 1);
  const exact = sessions.find((session) => session.id === ref);
  if (exact) return [exact];
  const byPath = new Map<string, PiSessionInfo>();
  for (const session of sessions) {
    if (session.id.startsWith(ref)) byPath.set(session.path, session);
  }
  return [...byPath.values()];
}
