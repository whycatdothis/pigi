import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SUBAGENT_ENTRY_TYPE } from '../../shared/remoteCommandContract';
import { isSubagentSession } from './subagentMarker';

const directory = mkdtempSync(join(tmpdir(), 'pigi-subagent-marker-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const PARENT = '/sessions/parent.jsonl';

function header(id: string): object {
  return { type: 'session', version: 3, id, parentSession: PARENT };
}

function marker(sessionId: string): object {
  return { type: 'custom', customType: SUBAGENT_ENTRY_TYPE, data: { version: 1, sessionId } };
}

function message(text: string): object {
  return { type: 'message', message: { role: 'user', content: text } };
}

function sessionFile(name: string, entries: object[]): string {
  const path = join(directory, `${name}.jsonl`);
  writeFileSync(path, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return path;
}

describe('isSubagentSession', () => {
  it('accepts a marker naming the session before the first message', async () => {
    const path = sessionFile('subagent', [header('a'), marker('a'), message('task')]);
    expect(await isSubagentSession({ path, id: 'a', parentSessionPath: PARENT })).toBe(true);
  });

  it('rejects a fork of a subagent, which copies the marker under a new id', async () => {
    const path = sessionFile('fork', [header('b'), marker('a'), message('task')]);
    expect(await isSubagentSession({ path, id: 'b', parentSessionPath: PARENT })).toBe(false);
  });

  it('ignores a marker after the first message', async () => {
    const path = sessionFile('late', [header('c'), message('task'), marker('c')]);
    expect(await isSubagentSession({ path, id: 'c', parentSessionPath: PARENT })).toBe(false);
  });

  it('is not fooled by a message that mentions the marker type', async () => {
    const path = sessionFile('mention', [header('d'), message(`about ${SUBAGENT_ENTRY_TYPE}`)]);
    expect(await isSubagentSession({ path, id: 'd', parentSessionPath: PARENT })).toBe(false);
  });

  it('skips the read for a session without a parent', async () => {
    const path = join(directory, 'missing.jsonl');
    expect(await isSubagentSession({ path, id: 'e' })).toBe(false);
  });

  it('treats an unreadable file as not a subagent', async () => {
    const path = join(directory, 'missing.jsonl');
    expect(await isSubagentSession({ path, id: 'f', parentSessionPath: PARENT })).toBe(false);
  });
});
