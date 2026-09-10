/**
 * Credential store for pi's auth.json that reads from disk on every access.
 *
 * Why not the SDK default (AuthStorage): it snapshots auth.json into memory
 * once, in its constructor, behind a 200ms synchronous lock retry. pi holds
 * that same lock for the whole OAuth token refresh — for the genai gateway
 * that is a ~9s `bk auth:issue-token` — so any pigi process that starts while
 * another one is refreshing (app launch spawns several; a warm process is
 * respawned on every claim) silently boots with zero credentials and never
 * reloads. Every OAuth provider then looks unconfigured in that process: its
 * models vanish from the picker and setModel throws "No API key".
 *
 * This store keeps no snapshot, so there is nothing to go stale: reads always
 * see the current file, and writes are serialized with the lock protocol pi
 * itself uses (proper-lockfile on auth.json), so the file stays safely shared
 * with concurrent pi CLI processes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import lockfile from 'proper-lockfile';
import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

const AUTH_FILE_NAME = 'auth.json';
const MODELS_FILE_NAME = 'models.json';
const AUTH_FILE_WRITE_OPTIONS = { encoding: 'utf-8', mode: 0o600 } as const;
// Same lock parameters as pi's AuthStorage, so both sides agree on staleness
// and a refresh held by the other side is waited for rather than clobbered.
const LOCK_OPTIONS: lockfile.LockOptions = {
  stale: 30000,
  retries: { retries: 10, factor: 2, minTimeout: 100, maxTimeout: 10000, randomize: true },
  onCompromised: (error) => console.error('auth.json lock compromised:', error.message),
};
// pi writes auth.json with a plain truncate-and-write; a reader can land in
// between and see an empty or partial file. Retry briefly before failing.
const TORN_READ_RETRIES = 5;
const TORN_READ_DELAY_MS = 20;

type CredentialFile = Record<string, Credential>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FileCredentialStore implements CredentialStore {
  constructor(private readonly authPath: string) {}

  async read(providerId: string): Promise<Credential | undefined> {
    return (await this.readFile())[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(await this.readFile()).map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    return this.withLock(async () => {
      const credentials = await this.readFile();
      const next = await fn(credentials[providerId]);
      if (next === undefined) {
        return credentials[providerId];
      }
      this.writeFile({ ...credentials, [providerId]: next });
      return next;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.withLock(async () => {
      const credentials = await this.readFile();
      delete credentials[providerId];
      this.writeFile(credentials);
    });
  }

  private async readFile(): Promise<CredentialFile> {
    for (let attempt = 0; ; attempt++) {
      if (!existsSync(this.authPath)) {
        return {};
      }
      try {
        // auth.json is a flat provider-id → credential object written by pi.
        return JSON.parse(readFileSync(this.authPath, 'utf-8')) as CredentialFile;
      } catch (error) {
        if (attempt >= TORN_READ_RETRIES) {
          throw error;
        }
        await delay(TORN_READ_DELAY_MS);
      }
    }
  }

  private writeFile(credentials: CredentialFile): void {
    writeFileSync(this.authPath, JSON.stringify(credentials, null, 2), AUTH_FILE_WRITE_OPTIONS);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // proper-lockfile needs the target to exist.
    if (!existsSync(this.authPath)) {
      mkdirSync(dirname(this.authPath), { recursive: true, mode: 0o700 });
      this.writeFile({});
    }
    const release = await lockfile.lock(this.authPath, LOCK_OPTIONS);
    try {
      return await fn();
    } finally {
      await release();
    }
  }
}

/** ModelRuntime bound to agentDir's auth.json (via FileCredentialStore) and models.json. */
export function createModelRuntime(agentDir: string): Promise<ModelRuntime> {
  return ModelRuntime.create({
    credentials: new FileCredentialStore(join(agentDir, AUTH_FILE_NAME)),
    modelsPath: join(agentDir, MODELS_FILE_NAME),
  });
}
