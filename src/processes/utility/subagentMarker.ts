import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { SUBAGENT_ENTRY_TYPE } from '../../shared/remoteCommandContract';

interface SessionFile {
  path: string;
  id: string;
  parentSessionPath?: string;
}

/** Decides on a session entry: `undefined` until a marker or the first message is read. */
function subagentVerdict(entry: unknown, sessionId: string): boolean | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  if (Reflect.get(entry, 'type') === 'message') return false;
  if (Reflect.get(entry, 'customType') !== SUBAGENT_ENTRY_TYPE) return undefined;
  const data: unknown = Reflect.get(entry, 'data');
  return typeof data === 'object' && data !== null && Reflect.get(data, 'sessionId') === sessionId;
}

/**
 * Whether a session was started by `pigi subagent` (docs/cli.md §10): its
 * marker entry comes before the first message and names the session's own id.
 * A fork copies the entry along with the path, but gets a new id.
 */
export async function isSubagentSession(session: SessionFile): Promise<boolean> {
  if (!session.parentSessionPath) return false;
  const input = createReadStream(session.path, 'utf8');
  const lines = createInterface({ input });
  try {
    for await (const line of lines) {
      if (!line.includes('"type":"message"') && !line.includes(SUBAGENT_ENTRY_TYPE)) continue;
      const verdict = subagentVerdict(JSON.parse(line), session.id);
      if (verdict !== undefined) return verdict;
    }
    return false;
  } catch {
    return false;
  } finally {
    lines.close();
    input.destroy();
  }
}

/** The same rule over a live session's entries, which may not be on disk yet. */
export function hasSubagentMarker(entries: readonly unknown[], sessionId: string): boolean {
  for (const entry of entries) {
    const verdict = subagentVerdict(entry, sessionId);
    if (verdict !== undefined) return verdict;
  }
  return false;
}
