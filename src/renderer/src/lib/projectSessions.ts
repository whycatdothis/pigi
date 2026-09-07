import type { PiSessionInfo } from '../../../shared/ipcContract';
import type { SessionEntry } from '../state/appStore';

/** Sessions in sidebar order, including new sessions not yet listed on disk. */
export function getProjectSessions(
  projectPath: string,
  projectSessions: Record<string, PiSessionInfo[]>,
  sessions: Map<string, SessionEntry>,
): PiSessionInfo[] {
  const listedSessions = projectSessions[projectPath] ?? [];
  const listedPaths = new Set(listedSessions.map((session) => session.path));
  const runningSessions = Array.from(sessions.values())
    .filter((session) => session.cwd === projectPath && !listedPaths.has(session.sessionPath))
    .map<PiSessionInfo>((session) => ({
      path: session.sessionPath,
      id: session.persistedSessionId,
      cwd: session.cwd,
      created: session.createdAt,
      modified: session.createdAt,
      messageCount: 0,
      firstMessage: session.title,
      allMessagesText: session.title,
    }));

  return [...runningSessions, ...listedSessions];
}
