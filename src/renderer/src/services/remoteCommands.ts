/**
 * Executes the `pigi` CLI's requests (docs/cli.md §3, §7). Main relays them
 * here because the renderer owns the UI state: a session created from the CLI
 * is the same store entry and transcript a click would create, it just never
 * takes the selection.
 */
import type {
  ModelInfo,
  PiSessionInfo,
  ProjectSessionsChunk,
  RemoteCommandRequest,
  ThinkingLevel,
} from '../../../shared/ipcContract';
import {
  SUBAGENT_STARTED_NOTIFICATION,
  remoteError,
  splitModelRef,
  type RemoteError,
  type RemoteMethod,
  type RemoteParams,
  type RemoteResults,
  type RemoteSessionCreated,
  type RemoteSessionReply,
  type RemoteSessionSummary,
} from '../../../shared/remoteCommandContract';
import { THINKING_LEVEL_ORDER } from '../../../shared/thinkingLevels';
import { useAppStore } from '../state/appStore';
import { getProjectSessions } from '../lib/projectSessions';
import { chatMessageTitle } from '../lib/chatAttachments';
import { ensureTranscriptSession, getTranscriptController } from '../hooks/useTranscript';
import {
  abort,
  createSession,
  getMessages,
  getModelCatalog,
  getState,
  onProjectSessionsChunk,
  onPush,
  prompt,
  readSessionMessages,
  resumeSession,
} from './piAgentClient';

/** How long a prompt may take to start its run before the call gives up. */
const RUN_START_TIMEOUT_MS = 30 * 1000;
const MODEL_SUGGESTION_LIMIT = 5;

class RemoteCommandFailure extends Error {
  constructor(readonly error: RemoteError) {
    super(error.message);
  }
}

function fail(...args: Parameters<typeof remoteError>): never {
  throw new RemoteCommandFailure(remoteError(...args));
}

interface CommandContext {
  signal: AbortSignal;
  notify: (method: string, params: unknown) => void;
}

type HandledMethod = Exclude<RemoteMethod, 'system.hello'>;
type Handler<M extends HandledMethod> = (
  params: RemoteParams[M],
  context: CommandContext,
) => Promise<RemoteResults[M]>;

function modelRef(model: { provider: string; id: string } | null): string | null {
  return model ? `${model.provider}/${model.id}` : null;
}

/** Every listed or still unlisted session pigi knows of, by path. */
function findKnownSession(path: string): PiSessionInfo | undefined {
  const { projectSessions, sessions } = useAppStore.getState();
  for (const listed of Object.values(projectSessions)) {
    const found = listed.find((session) => session.path === path);
    if (found) return found;
  }
  const entry = sessions.get(path);
  return entry ? getProjectSessions(entry.cwd, {}, new Map([[path, entry]]))[0] : undefined;
}

async function listSessions(cwd: string): Promise<PiSessionInfo[]> {
  // Collected from before the request: the chunk can arrive before the
  // request id it belongs to is known here.
  const chunks: ProjectSessionsChunk[] = [];
  let deliver: ((chunk: ProjectSessionsChunk) => void) | null = null;
  const unsubscribe = onProjectSessionsChunk((chunk) => {
    chunks.push(chunk);
    deliver?.(chunk);
  });
  try {
    const request = await window.piApi.listProjectSessions([cwd]);
    if (!request.success) fail('INTERNAL_ERROR', request.error ?? 'cannot list sessions');
    const matches = (chunk: ProjectSessionsChunk): boolean =>
      chunk.requestId === request.requestId && chunk.cwd === cwd;
    const chunk =
      chunks.find(matches) ??
      (await new Promise<ProjectSessionsChunk>((resolve) => {
        deliver = (next) => {
          if (matches(next)) resolve(next);
        };
      }));
    if (!chunk.success) fail('INTERNAL_ERROR', chunk.error ?? 'cannot list sessions');
    return chunk.sessions ?? [];
  } finally {
    unsubscribe();
  }
}

function summarize(session: PiSessionInfo): RemoteSessionSummary {
  const entry = useAppStore.getState().sessions.get(session.path);
  return {
    path: session.path,
    id: session.id,
    cwd: session.cwd,
    title: session.name || entry?.title || session.firstMessage,
    parentPath: session.parentSessionPath ?? null,
    isSubagent: session.isSubagent ?? false,
    running: entry !== undefined && entry.status !== 'idle',
    created: session.created,
    modified: session.modified,
    messageCount: session.messageCount,
  };
}

/** Unknown models fail with the closest ids listed; nothing is guessed. */
async function resolveModel(ref: string): Promise<{ provider: string; modelId: string }> {
  const parsed = splitModelRef(ref);
  if (!parsed) fail('INVALID_PARAMS', `model must be provider/model-id, got "${ref}"`);
  const { models } = await getModelCatalog();
  if (models.some((model) => model.provider === parsed.provider && model.id === parsed.modelId)) {
    return parsed;
  }
  const needle = parsed.modelId.toLowerCase();
  const similar = models
    .filter(
      (model: ModelInfo) =>
        model.id.toLowerCase().includes(needle) || needle.includes(model.id.toLowerCase()),
    )
    .slice(0, MODEL_SUGGESTION_LIMIT)
    .map((model) => `${model.provider}/${model.id}`);
  fail(
    'NOT_FOUND',
    similar.length > 0
      ? `unknown model ${ref}; similar: ${similar.join(', ')}`
      : `unknown model ${ref}`,
  );
}

/** The parent's current model and level: a new session would start from the app default. */
async function inheritedChoice(parent: string): Promise<{
  model: { provider: string; modelId: string } | null;
  thinkingLevel: ThinkingLevel | null;
}> {
  const entry = useAppStore.getState().sessions.get(parent);
  if (entry?.model) {
    return {
      model: { provider: entry.model.provider, modelId: entry.model.id },
      thinkingLevel: entry.thinkingLevel,
    };
  }
  try {
    const stored = await readSessionMessages(parent);
    const level = stored.thinkingLevel;
    return {
      model: stored.model,
      thinkingLevel: isThinkingLevel(level) ? level : null,
    };
  } catch {
    return { model: null, thinkingLevel: null };
  }
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVEL_ORDER.some((level) => level === value);
}

async function createBackgroundSession(
  params: RemoteParams['session.create'],
  extra: { subagent?: boolean; title?: string },
): Promise<RemoteSessionCreated> {
  const { parent } = params;
  const cwd = params.cwd ?? (parent ? findKnownSession(parent)?.cwd : undefined);
  if (!cwd) fail('NOT_FOUND', `pigi does not know session ${parent}; pass --cwd`);
  const inherited = parent ? await inheritedChoice(parent) : { model: null, thinkingLevel: null };
  const model = params.model ? await resolveModel(params.model) : inherited.model;
  const thinkingLevel = params.thinkingLevel ?? inherited.thinkingLevel;

  let path: string;
  try {
    path = await createSession(cwd, parent, {
      model: model ?? undefined,
      thinkingLevel: thinkingLevel ?? undefined,
      subagent: extra.subagent,
    });
  } catch (error) {
    fail('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  }

  const state = await getState(path);
  useAppStore.getState().addSessionEntry({
    sessionPath: path,
    persistedSessionId: state.sessionId,
    parentSessionPath: parent,
    isSubagent: extra.subagent,
    status: 'idle',
    title: extra.title ?? 'New chat',
    cwd,
    createdAt: new Date().toISOString(),
    model: state.model,
    thinkingLevel: state.thinkingLevel,
    contextUsage: state.contextUsage,
    autoCompactionEnabled: state.autoCompactionEnabled,
    messageCount: state.messageCount,
    error: null,
  });
  ensureTranscriptSession(path);
  return {
    path,
    model: modelRef(state.model),
    thinkingLevel: { requested: thinkingLevel, effective: state.thinkingLevel },
  };
}

/**
 * Attaches to a session the window has not opened (a reloaded window, or one
 * the user never clicked), as selecting it would, without selecting it.
 */
async function openSession(path: string): Promise<void> {
  if (useAppStore.getState().sessions.has(path)) return;
  const info = findKnownSession(path);
  if (!info) fail('NOT_FOUND', `pigi does not list session ${path}`);
  try {
    await resumeSession(path);
  } catch (error) {
    fail('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  }
  const state = await getState(path);
  const status = state.isStreaming ? 'streaming' : 'idle';
  useAppStore.getState().addSessionEntry({
    sessionPath: path,
    persistedSessionId: state.sessionId,
    parentSessionPath: info.parentSessionPath,
    isSubagent: info.isSubagent,
    status,
    title: info.name || info.firstMessage,
    cwd: info.cwd,
    createdAt: info.created,
    model: state.model,
    thinkingLevel: state.thinkingLevel,
    contextUsage: state.contextUsage,
    autoCompactionEnabled: state.autoCompactionEnabled,
    messageCount: state.messageCount,
    error: null,
  });
  ensureTranscriptSession(path).setStatus(status);
}

function isIdle(path: string): boolean {
  const { status, isCompacting } = getTranscriptController(path).state;
  return status === 'idle' && !isCompacting;
}

/**
 * The transcript controller of an exited session is disposed and never
 * notifies again, so a wait has to hear about the exit itself.
 */
function onSessionExit(path: string, listener: () => void): () => void {
  return window.piApi.onProcessExit(({ sessionPath }) => {
    if (sessionPath === path) listener();
  });
}

function sessionExited(path: string): RemoteError {
  return remoteError('SESSION_FAILED', 'the session process exited', { path });
}

/**
 * Resolves once the transcript leaves `idle`, or with the error that stopped
 * the prompt first. Waiting for the start makes `session prompt` followed by
 * `session wait` safe: the wait never sees the idle state before the run.
 */
function waitForRunStart(path: string, start: () => Promise<void>): Promise<void> {
  const controller = getTranscriptController(path);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: RemoteError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      offPush();
      offExit();
      if (error) reject(new RemoteCommandFailure(error));
      else resolve();
    };
    const timer = setTimeout(
      () => finish(remoteError('SESSION_FAILED', 'the session did not start running', { path })),
      RUN_START_TIMEOUT_MS,
    );
    const unsubscribe = controller.subscribe(() => {
      if (!isIdle(path)) finish();
    });
    const offPush = onPush(path, (message) => {
      if (message.type === 'error') {
        finish(remoteError('SESSION_FAILED', message.error, { path }));
      }
    });
    const offExit = onSessionExit(path, () => finish(sessionExited(path)));
    start().catch((error: unknown) =>
      finish(
        remoteError('SESSION_FAILED', error instanceof Error ? error.message : String(error), {
          path,
        }),
      ),
    );
  });
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (part: unknown) =>
        typeof part === 'object' && part !== null && Reflect.get(part, 'type') === 'text',
    )
    .map((part: object) => String(Reflect.get(part, 'text') ?? ''))
    .join('');
}

async function lastReply(path: string): Promise<RemoteSessionReply> {
  const { messages } = await getMessages(path);
  for (let index = messages.length - 1; index >= 0; index--) {
    const message: unknown = messages[index];
    if (typeof message !== 'object' || message === null) continue;
    if (Reflect.get(message, 'role') !== 'assistant') continue;
    const reply = textOf(Reflect.get(message, 'content'));
    const stopReason = String(Reflect.get(message, 'stopReason') ?? 'stop');
    if (stopReason === 'error' || stopReason === 'aborted') {
      const errorMessage = Reflect.get(message, 'errorMessage');
      fail(
        'SESSION_FAILED',
        typeof errorMessage === 'string' && errorMessage ? errorMessage : `session ${stopReason}`,
        { path, reply, stopReason },
      );
    }
    return { path, reply, stopReason };
  }
  return { path, reply: '', stopReason: 'stop' };
}

/** Resolves with the last reply once the session is idle. */
function waitForIdle(
  path: string,
  signal: AbortSignal,
  timeoutSeconds?: number,
): Promise<RemoteSessionReply> {
  const controller = getTranscriptController(path);
  return new Promise<RemoteSessionReply>((resolve, reject) => {
    let settled = false;
    let pushError: string | null = null;
    const cleanup = (): void => {
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      offPush();
      offExit();
      signal.removeEventListener('abort', onAbort);
    };
    const finish = (): void => {
      if (settled || !isIdle(path)) return;
      cleanup();
      if (pushError !== null) {
        reject(new RemoteCommandFailure(remoteError('SESSION_FAILED', pushError, { path })));
        return;
      }
      lastReply(path).then(resolve, reject);
    };
    const onAbort = (): void => {
      if (settled) return;
      cleanup();
      reject(new RemoteCommandFailure(remoteError('SESSION_FAILED', 'cancelled', { path })));
    };
    const timer =
      timeoutSeconds === undefined
        ? null
        : setTimeout(() => {
            if (settled) return;
            cleanup();
            reject(
              new RemoteCommandFailure(
                remoteError('TIMEOUT', `still running after ${timeoutSeconds}s`, { path }),
              ),
            );
          }, timeoutSeconds * 1000);
    const offPush = onPush(path, (message) => {
      if (message.type === 'error') pushError = message.error;
    });
    const offExit = onSessionExit(path, () => {
      if (settled) return;
      cleanup();
      reject(new RemoteCommandFailure(sessionExited(path)));
    });
    const unsubscribe = controller.subscribe(finish);
    signal.addEventListener('abort', onAbort);
    if (signal.aborted) onAbort();
    else finish();
  });
}

async function promptSession(path: string, text: string): Promise<void> {
  await openSession(path);
  if (!isIdle(path)) fail('SESSION_BUSY', `session is running: ${path}`);
  await waitForRunStart(path, () => prompt(path, text));
}

const HANDLERS: { [M in HandledMethod]: Handler<M> } = {
  'session.list': async ({ cwd }) => {
    const listed = await listSessions(cwd);
    const all = getProjectSessions(cwd, { [cwd]: listed }, useAppStore.getState().sessions);
    return { sessions: all.map(summarize) };
  },

  'session.create': (params) => createBackgroundSession(params, {}),

  'session.prompt': async ({ path, text }) => {
    await promptSession(path, text);
    return { path };
  },

  'session.wait': async ({ path, timeout }, { signal }) => {
    await openSession(path);
    return waitForIdle(path, signal, timeout);
  },

  'subagent.run': async ({ task, parent, model, thinkingLevel, detach }, { signal, notify }) => {
    // Every subagent's parent is known: its cwd comes from there.
    if (findKnownSession(parent)?.isSubagent) {
      fail('INVALID_PARAMS', 'a subagent cannot start subagents; do the task in this session', {
        param: 'parent',
      });
    }
    const created = await createBackgroundSession(
      { parent, model, thinkingLevel },
      { subagent: true, title: chatMessageTitle(task, []) },
    );
    if (signal.aborted) fail('SESSION_FAILED', 'cancelled', { path: created.path });
    notify(SUBAGENT_STARTED_NOTIFICATION, created);
    if (detach) {
      await promptSession(created.path, task);
      return created;
    }
    // The caller is gone (its bash call was aborted): so is the reason to run.
    const stopChild = (): void => void abort(created.path);
    signal.addEventListener('abort', stopChild);
    try {
      await promptSession(created.path, task);
      // A cancel that came while the run was starting found nothing to abort.
      if (signal.aborted) stopChild();
      return { ...created, ...(await waitForIdle(created.path, signal)) };
    } finally {
      signal.removeEventListener('abort', stopChild);
    }
  },
};

function runCommand<M extends HandledMethod>(
  method: M,
  params: RemoteParams[M],
  context: CommandContext,
): Promise<RemoteResults[M]> {
  const handler: Handler<M> = HANDLERS[method];
  return handler(params, context);
}

function isHandled(method: RemoteMethod): method is HandledMethod {
  return Object.hasOwn(HANDLERS, method);
}

/** Starts executing CLI requests; returns the teardown. */
export function installRemoteCommands(): () => void {
  const running = new Map<number, AbortController>();
  const { remoteControl } = window.piApi;

  const offCommand = remoteControl.onCommand((request: RemoteCommandRequest) => {
    const cancel = new AbortController();
    running.set(request.requestId, cancel);
    const line = (body: object): string => JSON.stringify({ jsonrpc: '2.0', ...body });
    const context: CommandContext = {
      signal: cancel.signal,
      notify: (method, params) =>
        remoteControl.send({
          requestId: request.requestId,
          line: line({ method, params }),
          final: false,
        }),
    };
    const { method } = request;
    const result = isHandled(method)
      ? // Main validated these params against the same spec the type is written from.
        runCommand(method, request.params as RemoteParams[typeof method], context)
      : Promise.reject(
          new RemoteCommandFailure(remoteError('METHOD_NOT_FOUND', `unknown method ${method}`)),
        );
    result
      .then(
        (value) => line({ id: request.id, result: value }),
        (error: unknown) =>
          line({
            id: request.id,
            error:
              error instanceof RemoteCommandFailure
                ? error.error
                : remoteError(
                    'INTERNAL_ERROR',
                    error instanceof Error ? error.message : String(error),
                  ),
          }),
      )
      .then((answer) => {
        running.delete(request.requestId);
        remoteControl.send({ requestId: request.requestId, line: answer, final: true });
      });
  });
  const offCancel = remoteControl.onCancel((requestId) => running.get(requestId)?.abort());
  remoteControl.ready();

  // Requests still running keep their sessions: a reload fails the request in
  // main, and the caller can `pigi session wait` on the path it was given.
  return () => {
    offCommand();
    offCancel();
  };
}
