/**
 * The one file in this app that belongs to somebody else.
 *
 * pi's `settings.json` holds every setting the reader has, so a write is a
 * read-modify-write of the requested dotted fields under the same
 * proper-lockfile scheme the pi TUI uses: a concurrent TUI cannot lose updates,
 * unrelated keys are preserved, and a crash mid-write cannot truncate the file.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import { setPiSettingValue, type PiSettingUpdate } from '../../shared/piSettings';

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

/**
 * Takes pi's settings lock, waiting for a holder rather than spinning.
 *
 * The wait has to be a real one: the process that calls this also carries the
 * session list, the catalog pushes and every settings request, all on one
 * message loop. A synchronous sleep here blocks all of them for as long as pi
 * holds the lock.
 */
export function acquireSettingsLock(path: string): Promise<() => Promise<void>> {
  return lockfile.lock(path, {
    realpath: false,
    retries: { retries: 9, factor: 1, minTimeout: 20, maxTimeout: 20, randomize: false },
  });
}

/**
 * Apply `updates` to the settings document at `path`.
 *
 * `null` clears a field, which also removes a parent object left empty by that
 * removal — the same shape pi writes itself would have.
 */
export async function writePiSettingsDocument(
  path: string,
  updates: readonly PiSettingUpdate[],
): Promise<void> {
  const directory = dirname(path);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  const release = await acquireSettingsLock(path);
  try {
    let document: Record<string, unknown> = {};
    if (existsSync(path)) {
      const parsed: unknown = JSON.parse(stripBom(readFileSync(path, 'utf-8')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${path} does not contain a JSON object`);
      }
      document = parsed as Record<string, unknown>;
    }
    for (const update of updates) {
      setPiSettingValue(document, update.field, update.value === null ? undefined : update.value);
    }
    // Written beside the target and renamed into place: a crash mid-write must
    // not leave pi with a truncated config. Mode 0600 from the start: pi's
    // settings can name an API key, and the rename would otherwise publish
    // whatever the umask allows. `mode` only applies when the file is created,
    // so a `.tmp` left behind by a killed write is chmod'ed as well.
    const temporaryPath = `${path}.tmp`;
    try {
      writeFileSync(temporaryPath, JSON.stringify(document, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      chmodSync(temporaryPath, 0o600);
      renameSync(temporaryPath, path);
    } catch (error) {
      // A failed write must not leave the half-written file next to the real one.
      rmSync(temporaryPath, { force: true });
      throw error;
    }
  } finally {
    // Never let a failing unlock replace the error that explains the failure.
    await release().catch((error: unknown) => {
      console.error('Failed to release the pi settings lock:', error);
    });
  }
}
