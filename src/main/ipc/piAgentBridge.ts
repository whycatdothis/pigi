/**
 * Pi Agent Bridge - main process bridge for session lifecycle.
 *
 * Each session gets its own utility process. Main manages:
 * 1. Spawning process per session (with warm process optimization)
 * 2. Two-step handshake: create session → get sessionPath → distribute ports
 * 3. Process cleanup on destroy or crash
 *
 * After port handshake, main is NOT in the data path.
 */
import { ipcMain, MessageChannelMain } from 'electron';
import { getMainWindow } from '../windows/createMainWindow';
import { createSessionWorkerProcess } from '../processes/createPiAgentProcess';
import { PiAgentProcessPool } from './piAgentProcessPool';
import {
  PiChannel,
  type CacheWarmEntry,
  type CreateSessionOptions,
  type ListProjectSessionsCommand,
  type ModelInfo,
  type SessionWorkerCommand,
  type SessionWorkerResponse,
  type SessionListResult,
  type UtilityCommand,
  type UtilityResponse,
} from '../../shared/ipcContract';
import {
  isPiSettingValue,
  type PiSettingsResult,
  type PiSettingsScope,
  type PiSettingUpdate,
} from '../../shared/piSettings';
import { THINKING_LEVEL_ORDER } from '../../shared/thinkingLevels';

let sessionWorkerProcess: Electron.UtilityProcess | null = null;
let sessionWorkerRequestId = 0;

/**
 * One session-worker request kind: the timeout message, the id prefix, and how
 * to read its answer.
 *
 * A request is identified by its definition object (not a string key), so a
 * reply type cannot be paired with another kind's reader — the pairing is the
 * function signature. `read` receives the reply message itself, which the
 * dispatcher narrows in its switch; adding a reply in `ipcContract.ts` without
 * a case there is a compile error (the switch ends in a `never` check) instead
 * of a request that waits for its timeout.
 */
interface SessionWorkerRequest<TReply, TResult> {
  idPrefix: string;
  timeoutError: string;
  read: (reply: TReply) => TResult;
}

const RENAME_SESSION_REQUEST: SessionWorkerRequest<
  Extract<SessionWorkerResponse, { type: 'rename_session_result' }>,
  { success: boolean; error?: string }
> = {
  idPrefix: 'rename',
  timeoutError: 'rename timed out',
  read: (reply) => ({ success: reply.success, error: reply.error }),
};

const READ_SESSION_MESSAGES_REQUEST: SessionWorkerRequest<
  Extract<SessionWorkerResponse, { type: 'session_messages_result' }>,
  {
    success: boolean;
    messages?: unknown[];
    compactionCount?: number;
    thinkingLevel?: string;
    model?: { provider: string; modelId: string } | null;
    cacheWarmEntries?: CacheWarmEntry[];
    error?: string;
  }
> = {
  idPrefix: 'read-messages',
  timeoutError: 'read session messages timed out',
  read: (reply) => ({
    success: reply.success,
    messages: reply.messages,
    compactionCount: reply.compactionCount,
    thinkingLevel: reply.thinkingLevel,
    model: reply.model,
    cacheWarmEntries: reply.cacheWarmEntries,
    error: reply.error,
  }),
};

/** Reads and writes share one reply shape, so they share one kind. */
const PI_SETTINGS_REQUEST: SessionWorkerRequest<PiSettingsResult, PiSettingsResult> = {
  idPrefix: 'settings',
  timeoutError: 'settings request timed out',
  read: (reply) => ({
    success: reply.success,
    error: reply.error,
    snapshot: reply.snapshot,
  }),
};

interface PendingRequest {
  /** Resolves the caller's promise; the kind owns the result type. */
  settle: (result: unknown) => void;
  timer: NodeJS.Timeout;
}

const pendingSessionWorkerRequests = new Map<string, PendingRequest>();

const SESSION_WORKER_REQUEST_TIMEOUT_MS = 10000;

/**
 * A bare failure satisfies every kind's answer, since each one carries
 * `success` and an optional `error`.
 */
function failureResult<TResult>(error: string): TResult {
  // The result types are records with `success`/`error`; the generic cannot
  // destructure that, so the invariant is stated here once.
  return { success: false, error } as TResult;
}

/**
 * Hands one worker reply to the request that awaits it. The pair (definition,
 * reply) is checked at the call site, so a rename reply cannot resolve a
 * settings request.
 */
function settleRequest<TReply, TResult>(
  definition: SessionWorkerRequest<TReply, TResult>,
  reply: TReply,
  requestId: string,
): void {
  const pending = pendingSessionWorkerRequests.get(requestId);
  if (!pending) {
    return;
  }
  pendingSessionWorkerRequests.delete(requestId);
  clearTimeout(pending.timer);
  pending.settle(definition.read(reply));
}

type SessionWorkerRequestCommand = Exclude<SessionWorkerCommand, { type: 'reload_catalog' }>;

/**
 * Posts one command and waits for the worker's reply. A failure resolves the
 * kind's failure shape rather than throwing into ipcMain.
 */
function requestFromSessionWorker<TReply, TResult>(
  definition: SessionWorkerRequest<TReply, TResult>,
  build: (requestId: string) => SessionWorkerRequestCommand,
): Promise<TResult> {
  startSessionWorker();
  if (!sessionWorkerProcess) {
    return Promise.resolve(failureResult<TResult>('session worker process not available'));
  }
  const proc = sessionWorkerProcess;
  const command = build(`${definition.idPrefix}-${++sessionWorkerRequestId}`);
  return new Promise<TResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingSessionWorkerRequests.delete(command.requestId);
      resolve(failureResult<TResult>(definition.timeoutError));
    }, SESSION_WORKER_REQUEST_TIMEOUT_MS);
    pendingSessionWorkerRequests.set(command.requestId, {
      settle: (result) => resolve(result as TResult),
      timer,
    });
    proc.postMessage(command);
  });
}

/** Null when the options are malformed; undefined fields are left out. */
function parseCreateSessionOptions(raw: unknown): CreateSessionOptions | null {
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null) return null;
  const model: unknown = Reflect.get(raw, 'model');
  const thinkingLevel: unknown = Reflect.get(raw, 'thinkingLevel');
  const subagent: unknown = Reflect.get(raw, 'subagent');
  const options: CreateSessionOptions = {};
  if (model !== undefined) {
    if (typeof model !== 'object' || model === null) return null;
    const provider: unknown = Reflect.get(model, 'provider');
    const modelId: unknown = Reflect.get(model, 'modelId');
    if (typeof provider !== 'string' || typeof modelId !== 'string') return null;
    options.model = { provider, modelId };
  }
  if (thinkingLevel !== undefined) {
    const level = THINKING_LEVEL_ORDER.find((candidate) => candidate === thinkingLevel);
    if (!level) return null;
    options.thinkingLevel = level;
  }
  if (subagent !== undefined) {
    if (typeof subagent !== 'boolean') return null;
    options.subagent = subagent;
  }
  return options;
}

function sendToRenderer(channel: PiChannel, data: unknown): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

const processPool = new PiAgentProcessPool((sessionPath, code) => {
  sendToRenderer(PiChannel.ProcessExit, { sessionPath, code });
});

// The session worker is the single producer of the model catalog; it loads it
// at startup, rebuilds it on credential changes, and reloads on renderer
// request (picker refresh). Main keeps the last published snapshot so a
// freshly loaded renderer gets an immediate answer, and forwards every update
// push with a monotonically increasing version so the renderer can drop
// out-of-order snapshots.

let modelCatalogCache: ModelInfo[] = [];
let modelCatalogVersion = 0;

// Respawn policy: the worker self-exits when it cannot build a catalog (the
// only way to clear a wedged SDK network call), so main respawns it with a
// capped exponential backoff. Failures reset once a catalog is published.
const SESSION_WORKER_RESPAWN_BASE_DELAY_MS = 2000;
const SESSION_WORKER_RESPAWN_MAX_DELAY_MS = 30000;
const SESSION_WORKER_MAX_RESPAWN_FAILURES = 3;
// Picker-originated refreshes: throttle reloads so a burst of open/close
// cycles costs one rebuild, and revive a dead worker on a cooldown so a
// persistent config error cannot turn every click into a spawn/exit thrash.
const PICKER_REFRESH_THROTTLE_MS = 5000;
const WORKER_REVIVE_COOLDOWN_MS = 30000;
let sessionWorkerRespawnTimer: NodeJS.Timeout | null = null;
let sessionWorkerRespawnFailures = 0;
let lastPickerRefreshAt = 0;
let lastWorkerReviveAt = 0;
let isShuttingDown = false;

function scheduleSessionWorkerRespawn(): void {
  if (
    isShuttingDown ||
    sessionWorkerRespawnTimer ||
    sessionWorkerRespawnFailures >= SESSION_WORKER_MAX_RESPAWN_FAILURES
  ) {
    return;
  }
  sessionWorkerRespawnFailures += 1;
  const delay = Math.min(
    SESSION_WORKER_RESPAWN_BASE_DELAY_MS * 2 ** (sessionWorkerRespawnFailures - 1),
    SESSION_WORKER_RESPAWN_MAX_DELAY_MS,
  );
  sessionWorkerRespawnTimer = setTimeout(() => {
    sessionWorkerRespawnTimer = null;
    startSessionWorker();
  }, delay);
}

function startSessionWorker(): void {
  if (sessionWorkerRespawnTimer) {
    clearTimeout(sessionWorkerRespawnTimer);
    sessionWorkerRespawnTimer = null;
  }
  if (sessionWorkerProcess) {
    return;
  }

  const proc = createSessionWorkerProcess();
  sessionWorkerProcess = proc;

  proc.on('message', (message: SessionWorkerResponse) => {
    switch (message.type) {
      case 'catalog_updated':
        modelCatalogCache = message.models;
        modelCatalogVersion += 1;
        sessionWorkerRespawnFailures = 0;
        sendToRenderer(PiChannel.ModelCatalogUpdated, {
          version: modelCatalogVersion,
          models: message.models,
        });
        break;
      case 'project_sessions_chunk':
        sendToRenderer(PiChannel.ProjectSessionsChunk, {
          requestId: message.requestId,
          cwd: message.cwd,
          success: message.success,
          sessions: message.sessions,
          error: message.error,
        });
        break;
      case 'rename_session_result':
        settleRequest(RENAME_SESSION_REQUEST, message, message.requestId);
        break;
      case 'session_messages_result':
        settleRequest(READ_SESSION_MESSAGES_REQUEST, message, message.requestId);
        break;
      case 'settings_result':
        settleRequest(PI_SETTINGS_REQUEST, message, message.requestId);
        break;
      default: {
        // Every reply above is answered or forwarded; a new one has to be added
        // here, which is what this line makes the compiler say.
        const unhandled: never = message;
        throw new Error(`Unhandled session worker reply: ${String(unhandled)}`);
      }
    }
  });

  proc.on('exit', () => {
    if (sessionWorkerProcess === proc) {
      sessionWorkerProcess = null;
      // The cache is kept: it is the last known catalog and stays valid until
      // the respawned worker publishes (a respawned worker reloads the
      // catalog on startup, so recovery needs no coordination here).
      for (const [id, pending] of pendingSessionWorkerRequests) {
        clearTimeout(pending.timer);
        pending.settle(failureResult('session worker process exited'));
        pendingSessionWorkerRequests.delete(id);
      }
      scheduleSessionWorkerRespawn();
    }
  });
}

function listProjectSessions(cwds: string[]): SessionListResult {
  startSessionWorker();
  if (!sessionWorkerProcess) {
    return { success: false, error: 'session worker process not available' };
  }

  const requestId = `session-list-${++sessionWorkerRequestId}`;
  const command: ListProjectSessionsCommand = {
    type: 'list_project_sessions',
    requestId,
    cwds: [...new Set(cwds)],
  };
  sessionWorkerProcess.postMessage(command);
  // Prewarm services in the warm process for these cwds
  processPool.ensureWarmProcess(cwds);
  return { success: true, requestId };
}

/** Processes whose lifetime messages are already routed (a warm process is
 *  claimed for several setup attempts over its life). */
const routedProcesses = new WeakSet<Electron.UtilityProcess>();

/**
 * The replies a process sends for its whole life, independent of the setup
 * handshake below: busy state on every run, credentials after a login.
 */
function routeLifetimeMessages(proc: Electron.UtilityProcess): void {
  if (routedProcesses.has(proc)) return;
  routedProcesses.add(proc);
  proc.on('message', (message: UtilityResponse) => {
    if (message.type === 'session_busy_changed') {
      processPool.updateBusyState(proc, message.isBusy);
      return;
    }
    // A login/logout in this session process changed stored credentials.
    // Every process reads auth.json on demand, so only the published catalog
    // (provider availability) needs recomputing.
    if (message.type === 'credentials_changed') {
      startSessionWorker();
      sessionWorkerProcess?.postMessage({ type: 'reload_catalog' });
    }
  });
}

async function attemptSpawnSessionProcess(
  command: UtilityCommand,
  proc: Electron.UtilityProcess,
): Promise<{ success: boolean; sessionPath?: string; error?: string }> {
  routeLifetimeMessages(proc);
  return new Promise((resolve) => {
    let resolved = false;

    /** Both listeners belong to this handshake only: a second one on the same
     *  process would answer the same reply twice. */
    const settle = (result: { success: boolean; sessionPath?: string; error?: string }): void => {
      resolved = true;
      clearTimeout(timeout);
      proc.off('message', onMessage);
      proc.off('exit', onExit);
      resolve(result);
    };

    const onMessage = (message: UtilityResponse): void => {
      // Ignore warm_ready during session setup (it's from the warm phase)
      if (resolved || message.type === 'warm_ready') return;

      switch (message.type) {
        case 'session_created': {
          const sessionPath = message.sessionPath;
          if (!sessionPath) {
            proc.kill();
            settle({ success: false, error: 'session created without a path' });
            break;
          }

          processPool.registerSessionProcess(sessionPath, proc);

          const controlChannel = new MessageChannelMain();
          const dataChannel = new MessageChannelMain();
          const attachCommand: UtilityCommand = { type: 'attach_ports' };
          proc.postMessage(attachCommand, [controlChannel.port1, dataChannel.port1]);

          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.postMessage(PiChannel.SessionPort, { sessionPath }, [
              controlChannel.port2,
              dataChannel.port2,
            ]);
          }

          settle({ success: true, sessionPath });
          break;
        }
        case 'session_error': {
          proc.kill();
          settle({ success: false, error: message.error });
          break;
        }
      }
    };

    const onExit = (code: number): void => {
      if (!resolved) {
        settle({ success: false, error: `process exited with code ${code} during setup` });
      }
    };

    const timeout = setTimeout(() => {
      if (resolved) return;
      proc.kill();
      settle({ success: false, error: 'session creation timed out' });
    }, 30000);

    proc.on('message', onMessage);
    proc.on('exit', onExit);
    proc.postMessage(command);
  });
}

/**
 * Spawn a utility process (or claim the warm one), send lifecycle command,
 * wait for sessionPath, then establish dedicated control/data MessagePorts.
 * Retries once with a fresh process if the first attempt fails.
 */
async function spawnSessionProcess(
  command: UtilityCommand,
): Promise<{ success: boolean; sessionPath?: string; error?: string }> {
  const firstProc = processPool.claimWarmProcess() ?? processPool.createFreshProcess();
  const firstResult = await attemptSpawnSessionProcess(command, firstProc);
  if (firstResult.success) {
    return firstResult;
  }

  // Retry once with a fresh process (warm process may have been stale/crashed)
  const retryProc = processPool.createFreshProcess();
  const retryResult = await attemptSpawnSessionProcess(command, retryProc);
  if (retryResult.success) {
    return retryResult;
  }

  return { success: false, error: retryResult.error ?? firstResult.error };
}

/**
 * Packages changed on disk: providers may have come or gone, and the warm
 * process holds services built from the old set. Running sessions are the
 * renderer's to reload, since only it knows which ones are idle.
 */
export function reloadAfterPackageChange(): void {
  if (isShuttingDown) return;
  processPool.recycleWarmProcess();
  startSessionWorker();
  sessionWorkerProcess?.postMessage({ type: 'reload_catalog' });
}

/** Dev debug handle only (see debugConfig.ts). */
export function getPiAgentDebugSnapshot(): Record<string, unknown> {
  return {
    sessionWorkerPid: sessionWorkerProcess?.pid ?? null,
    modelCatalogVersion,
    modelCatalogSize: modelCatalogCache.length,
    ...processPool.snapshot(),
  };
}

export function stopAllProcesses(): void {
  isShuttingDown = true;
  if (sessionWorkerRespawnTimer) {
    clearTimeout(sessionWorkerRespawnTimer);
    sessionWorkerRespawnTimer = null;
  }
  processPool.stopAllProcesses();
  sessionWorkerProcess?.kill();
  sessionWorkerProcess = null;
}

export function registerIpcHandlers(): void {
  startSessionWorker();
  processPool.ensureWarmProcess();

  ipcMain.handle(
    PiChannel.CreateSession,
    async (_e, cwd: string, parentSessionPath?: string, options?: unknown) => {
      if (!cwd || typeof cwd !== 'string') {
        return { success: false, error: 'cwd must be a non-empty string' };
      }
      if (parentSessionPath !== undefined && typeof parentSessionPath !== 'string') {
        return { success: false, error: 'parentSessionPath must be a string' };
      }
      const parsedOptions = parseCreateSessionOptions(options);
      if (parsedOptions === null) {
        return { success: false, error: 'invalid session options' };
      }
      return spawnSessionProcess({
        type: 'create_session',
        cwd,
        parentSessionPath,
        options: parsedOptions,
      });
    },
  );

  ipcMain.handle(PiChannel.ResumeSession, async (_e, sessionPath: string) => {
    if (!sessionPath || typeof sessionPath !== 'string' || sessionPath.trim().length === 0) {
      return { success: false, error: 'sessionPath must be a non-empty string' };
    }
    const existing = processPool.findBySessionPath(sessionPath);
    if (existing) {
      processPool.touchSessionProcess(sessionPath);

      // Re-establish MessagePorts (renderer may have reloaded)
      const controlChannel = new MessageChannelMain();
      const dataChannel = new MessageChannelMain();
      const attachCommand: UtilityCommand = { type: 'attach_ports' };
      existing.process.postMessage(attachCommand, [controlChannel.port1, dataChannel.port1]);

      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.postMessage(PiChannel.SessionPort, { sessionPath }, [
          controlChannel.port2,
          dataChannel.port2,
        ]);
      }

      return { success: true, sessionPath };
    }
    return spawnSessionProcess({ type: 'resume_session', sessionPath });
  });

  ipcMain.handle(PiChannel.DestroySession, async (_e, sessionPath: string) => {
    if (!sessionPath || typeof sessionPath !== 'string') {
      return { success: false, error: 'sessionPath must be a non-empty string' };
    }
    return { success: processPool.destroySessionProcess(sessionPath) };
  });

  ipcMain.handle(PiChannel.TouchSession, async (_e, sessionPath: string) => {
    if (!sessionPath || typeof sessionPath !== 'string') {
      return { success: false, error: 'sessionPath must be a non-empty string' };
    }
    return { success: processPool.touchSessionProcess(sessionPath) };
  });

  ipcMain.handle(PiChannel.GetBusySessions, () => processPool.busySessionPaths());

  ipcMain.handle(PiChannel.GetModelCatalog, async () => {
    // Pure cache read: the worker publishes on startup and on credential
    // changes; updates arrive via ModelCatalogUpdated.
    return { version: modelCatalogVersion, models: modelCatalogCache };
  });

  ipcMain.handle(PiChannel.RefreshModelCatalog, async () => {
    // Return the current snapshot immediately (corrects a renderer whose
    // snapshot went stale) and kick a background reload; updates arrive via
    // ModelCatalogUpdated.
    const now = Date.now();
    if (now - lastPickerRefreshAt >= PICKER_REFRESH_THROTTLE_MS) {
      lastPickerRefreshAt = now;
      if (!sessionWorkerProcess && now - lastWorkerReviveAt >= WORKER_REVIVE_COOLDOWN_MS) {
        lastWorkerReviveAt = now;
        startSessionWorker();
      }
      sessionWorkerProcess?.postMessage({ type: 'reload_catalog' });
    }
    return { version: modelCatalogVersion, models: modelCatalogCache };
  });

  ipcMain.handle(PiChannel.ListProjectSessions, async (_e, cwds: string[]) => {
    if (!Array.isArray(cwds) || cwds.some((cwd) => !cwd || typeof cwd !== 'string')) {
      return { success: false, error: 'cwds must be an array of non-empty strings' };
    }
    return listProjectSessions(cwds);
  });

  ipcMain.handle(
    PiChannel.RenamePersistedSession,
    async (_e, sessionPath: string, name: string) => {
      if (!sessionPath || typeof sessionPath !== 'string') {
        return { success: false, error: 'sessionPath must be a non-empty string' };
      }
      if (!name || typeof name !== 'string') {
        return { success: false, error: 'name must be a non-empty string' };
      }
      return requestFromSessionWorker(RENAME_SESSION_REQUEST, (requestId) => ({
        type: 'rename_session',
        requestId,
        sessionPath,
        name,
      }));
    },
  );

  ipcMain.handle(PiChannel.ReadSessionMessages, async (_e, sessionPath: string) => {
    if (!sessionPath || typeof sessionPath !== 'string' || sessionPath.trim().length === 0) {
      return { success: false, error: 'sessionPath must be a non-empty string' };
    }
    return requestFromSessionWorker(READ_SESSION_MESSAGES_REQUEST, (requestId) => ({
      type: 'read_session_messages',
      requestId,
      sessionPath,
    }));
  });

  ipcMain.handle(PiChannel.GetPiSettings, async (_e, cwd: string) => {
    if (!cwd || typeof cwd !== 'string' || cwd.trim().length === 0) {
      return { success: false, error: 'cwd must be a non-empty string' };
    }
    return requestFromSessionWorker(PI_SETTINGS_REQUEST, (requestId) => ({
      type: 'read_settings',
      requestId,
      cwd,
    }));
  });

  ipcMain.handle(
    PiChannel.SetPiSettings,
    async (_e, cwd: string, scope: PiSettingsScope, updates: unknown) => {
      if (!cwd || typeof cwd !== 'string' || cwd.trim().length === 0) {
        return { success: false, error: 'cwd must be a non-empty string' };
      }
      if (scope !== 'global' && scope !== 'project') {
        return { success: false, error: 'scope must be "global" or "project"' };
      }
      if (!Array.isArray(updates) || updates.length === 0 || updates.length > 32) {
        return { success: false, error: 'updates must be a non-empty array of at most 32 entries' };
      }
      for (const update of updates) {
        if (typeof update !== 'object' || update === null) {
          return { success: false, error: 'each update must be an object' };
        }
        const candidate = update as { field?: unknown; value?: unknown };
        if (typeof candidate.field !== 'string' || candidate.field.length === 0) {
          return { success: false, error: 'each update needs a non-empty field' };
        }
        if (candidate.value !== null && !isPiSettingValue(candidate.value)) {
          return { success: false, error: 'each update value must be a setting value or null' };
        }
      }
      const result = await requestFromSessionWorker(PI_SETTINGS_REQUEST, (requestId) => ({
        type: 'write_settings',
        requestId,
        cwd,
        scope,
        // Safe narrowing: the worker validates every field against the registry.
        updates: updates as PiSettingUpdate[],
      }));
      // The warm process read the settings file when it started, and a session
      // claimed from it selects its tools and model from that snapshot; drop it
      // so the next session sees what was just written.
      if (result.success) {
        processPool.recycleWarmProcess();
      }
      return result;
    },
  );
}
