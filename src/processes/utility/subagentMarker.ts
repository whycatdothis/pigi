import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { SUBAGENT_ENTRY_TYPE } from '../../shared/remoteCommandContract';

interface SessionFile {
  path: string;
  id: string;
  parentSessionPath?: string;
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
      const entry: unknown = JSON.parse(line);
      if (typeof entry !== 'object' || entry === null) continue;
      if (Reflect.get(entry, 'type') === 'message') return false;
      if (Reflect.get(entry, 'customType') !== SUBAGENT_ENTRY_TYPE) continue;
      const data: unknown = Reflect.get(entry, 'data');
      return (
        typeof data === 'object' && data !== null && Reflect.get(data, 'sessionId') === session.id
      );
    }
    return false;
  } catch {
    return false;
  } finally {
    lines.close();
    input.destroy();
  }
}
