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
  isSessionFileRef,
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
import { isAgentBusy, useAppStore } from '../state/appStore';
import { getProjectSessions } from '../lib/projectSessions';
import { chatMessageTitle } from '../lib/chatAttachments';
import {
  disposeTranscriptSession,
  ensureTranscriptSession,
  getTranscriptController,
  markSessionHydrated,
} from '../hooks/useTranscript';
import { extractMessageText, latestAssistantActivity } from '../../../shared/messageText';
import { matchSessions } from '../lib/sessionLookup';
import {
  abort,
  createSession,
  getMessages,
  getModelCatalog,
  getProjects,
  getState,
  onProjectSessionsChunk,
  onPush,
  prompt,
  readSessionMessages,
  resumeSession,
  destroySession,
  sendCustomMessage,
  touchSession,
} from './piAgentClient';
import {
  forgetSubagentNotice,
  pendingSubagentNotices,
  rememberSubagentNotice,
  SUBAGENT_NOTICE_TYPE,
  subagentNoticeText,
  type PendingSubagentNotice,
  type SubagentOutcome,
} from '../lib/subagentNotices';

/** How long a prompt may take to start its run before the call gives up. */
const RUN_START_TIMEOUT_MS = 30 * 1000;
const SESSION_LIST_TIMEOUT_MS = 30 * 1000;
const MODEL_SUGGESTION_LIMIT = 5;
const AMBIGUOUS_ID_LIMIT = 5;

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

/** Every session pigi knows of: the listed ones and created ones whose file is not written yet. */
function knownSessions(listed: Record<string, PiSessionInfo[]>): PiSessionInfo[] {
  const { sessions } = useAppStore.getState();
  const cwds = new Set([
    ...Object.keys(listed),
    ...[...sessions.values()].map((entry) => entry.cwd),
  ]);
  return [...cwds].flatMap((cwd) => getProjectSessions(cwd, listed, sessions));
}

async function projectPaths(): Promise<string[]> {
  const result = await getProjects();
  if (!result.success) fail('INTERNAL_ERROR', result.error ?? 'cannot read projects');
  return result.recentProjects.map((project) => project.path);
}

function onlyMatch(ref: string, matches: PiSessionInfo[]): PiSessionInfo {
  if (matches.length === 0) fail('NOT_FOUND', `pigi does not know session ${ref}`);
  if (matches.length > 1) {
    const ids = matches.slice(0, AMBIGUOUS_ID_LIMIT).map((session) => session.id);
    fail('INVALID_PARAMS', `${ref} matches ${matches.length} sessions: ${ids.join(', ')}`);
  }
  return matches[0];
}

/**
 * Looks in what the window has listed first. A miss lists every project
 * again, since a reloaded window may not have listed them yet, and then opens
 * the running sessions it still does not know: one in its first turn has no
 * file to list, and a reload emptied the store that had it.
 */
async function resolveSession(ref: string, signal: AbortSignal): Promise<PiSessionInfo> {
  const inWindow = matchSessions(ref, knownSessions(useAppStore.getState().projectSessions));
  if (inWindow.length > 0) return onlyMatch(ref, inWindow);
  const listed = await listProjects(await projectPaths(), signal);
  const known = knownSessions(listed);
  const matches = matchSessions(ref, known);
  if (matches.length > 0) return onlyMatch(ref, matches);
  const knownPaths = new Set(known.map((session) => session.path));
  const unknownRunning = (await window.piApi.getBusySessions()).filter(
    (path) => !knownPaths.has(path),
  );
  await Promise.allSettled(unknownRunning.map(openSession));
  return onlyMatch(ref, matchSessions(ref, knownSessions(listed)));
}

async function listSessions(cwd: string, signal: AbortSignal): Promise<PiSessionInfo[]> {
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
    // The worker answers with a chunk, not a reply main tracks: if it exits
    // mid-list, nothing else would end this wait.
    const chunk =
      chunks.find(matches) ??
      (await new Promise<ProjectSessionsChunk>((resolve, reject) => {
        const stop = (message: string): void => {
          clearTimeout(timer);
          reject(new RemoteCommandFailure(remoteError('INTERNAL_ERROR', message)));
        };
        const timer = setTimeout(
          () => stop('the session list did not arrive'),
          SESSION_LIST_TIMEOUT_MS,
        );
        signal.addEventListener('abort', () => stop('cancelled'), { once: true });
        deliver = (next) => {
          if (!matches(next)) return;
          clearTimeout(timer);
          resolve(next);
        };
      }));
    if (!chunk.success) fail('INTERNAL_ERROR', chunk.error ?? 'cannot list sessions');
    return chunk.sessions ?? [];
  } finally {
    unsubscribe();
  }
}

async function listProjects(
  cwds: string[],
  signal: AbortSignal,
): Promise<Record<string, PiSessionInfo[]>> {
  const lists = await Promise.all(cwds.map((cwd) => listSessions(cwd, signal)));
  return Object.fromEntries(cwds.map((cwd, index) => [cwd, lists[index]]));
}

/**
 * Main tracks which session processes are in a turn, which survives a window
 * reload; the store adds a session that is starting one.
 */
async function runningSessionPaths(): Promise<Set<string>> {
  const running = new Set(await window.piApi.getBusySessions());
  for (const entry of useAppStore.getState().sessions.values()) {
    if (isAgentBusy(entry.status)) running.add(entry.sessionPath);
  }
  return running;
}

function sessionTitle(session: PiSessionInfo): string {
  return (
    session.name || useAppStore.getState().sessions.get(session.path)?.title || session.firstMessage
  );
}

function summarize(session: PiSessionInfo, running: Set<string>): RemoteSessionSummary {
  return {
    path: session.path,
    id: session.id,
    cwd: session.cwd,
    title: sessionTitle(session),
    parentPath: session.parentSessionPath ?? null,
    isSubagent: session.isSubagent ?? false,
    running: running.has(session.path),
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

/** `parent` is a resolved session file. */
async function createBackgroundSession(
  params: RemoteParams['session.create'] & { cwd: string },
  extra: { subagent?: boolean; title?: string },
): Promise<RemoteSessionCreated> {
  const { parent, cwd } = params;
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
  keepSelectedSessionInView();

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
    id: state.sessionId,
    model: modelRef(state.model),
    thinkingLevel: { requested: thinkingLevel, effective: state.thinkingLevel },
  };
}

/**
 * Main's process pool takes a created or resumed session for the one in view,
 * which spares it from idle pruning; give that back to the session the user is
 * looking at, or pruning can close it under them.
 */
function keepSelectedSessionInView(): void {
  const selected = useAppStore.getState().activeSessionPath;
  if (selected) void touchSession(selected);
}

const openingSessions = new Map<string, Promise<void>>();

/**
 * Attaches to a session the window has not opened (a reloaded window, or one
 * the user never clicked), as selecting it would, without selecting it. Two
 * requests for the same session share one attach.
 */
function openSession(path: string): Promise<void> {
  if (useAppStore.getState().sessions.has(path)) return Promise.resolve();
  let opening = openingSessions.get(path);
  if (!opening) {
    opening = attachSession(path).finally(() => openingSessions.delete(path));
    openingSessions.set(path, opening);
  }
  return opening;
}

async function attachSession(path: string): Promise<void> {
  try {
    await resumeSession(path);
    keepSelectedSessionInView();
    markSessionHydrated(path);
    const controller = ensureTranscriptSession(path);
    const { messages, compactionCount } = await getMessages(path);
    controller.hydrate(messages, compactionCount);
    // Read after hydrating, which resets the status to idle: a session that
    // is mid-run would otherwise end every wait at once.
    const state = await getState(path);
    const status = state.isStreaming ? 'streaming' : 'idle';
    const firstUserMessage: unknown = messages.find(
      (message: unknown) =>
        typeof message === 'object' && message !== null && Reflect.get(message, 'role') === 'user',
    );
    useAppStore.getState().addSessionEntry({
      sessionPath: path,
      persistedSessionId: state.sessionId,
      parentSessionPath: state.parentSessionPath,
      isSubagent: state.isSubagent,
      status,
      title: firstUserMessage
        ? chatMessageTitle(extractMessageText(Reflect.get(firstUserMessage, 'content')), [])
        : 'New chat',
      cwd: state.cwd,
      createdAt: new Date().toISOString(),
      model: state.model,
      thinkingLevel: state.thinkingLevel,
      contextUsage: state.contextUsage,
      autoCompactionEnabled: state.autoCompactionEnabled,
      messageCount: state.messageCount,
      error: null,
    });
    controller.setStatus(status);
  } catch (error) {
    // Unmarks it as hydrated too, so a click later loads its messages.
    disposeTranscriptSession(path);
    fail('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  }
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

async function lastReply(path: string): Promise<RemoteSessionReply> {
  const { messages } = await getMessages(path);
  for (let index = messages.length - 1; index >= 0; index--) {
    const message: unknown = messages[index];
    if (typeof message !== 'object' || message === null) continue;
    if (Reflect.get(message, 'role') !== 'assistant') continue;
    const reply = extractMessageText(Reflect.get(message, 'content'));
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

interface WaitOptions {
  timeoutSeconds?: number;
  /** Abort the session when the timeout runs out or the wait is cancelled. */
  stop?: boolean;
}

const STOPPED_AT_TIMEOUT = 'stopped: still running when the timeout ran out';

/** Resolves with the last reply once the session is idle. */
function waitForIdle(
  path: string,
  signal: AbortSignal,
  { timeoutSeconds, stop = false }: WaitOptions = {},
): Promise<RemoteSessionReply> {
  const controller = getTranscriptController(path);
  return new Promise<RemoteSessionReply>((resolve, reject) => {
    let settled = false;
    let stoppedAtTimeout = false;
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
      lastReply(path).then(resolve, (error: unknown) => {
        if (!stoppedAtTimeout || !(error instanceof RemoteCommandFailure)) return reject(error);
        const { reply, stopReason } = error.error.data;
        reject(
          new RemoteCommandFailure(
            remoteError('SESSION_FAILED', STOPPED_AT_TIMEOUT, { path, reply, stopReason }),
          ),
        );
      });
    };
    const onAbort = (): void => {
      if (settled) return;
      cleanup();
      if (stop) void abort(path);
      reject(new RemoteCommandFailure(remoteError('SESSION_FAILED', 'cancelled', { path })));
    };
    const timer =
      timeoutSeconds === undefined
        ? null
        : setTimeout(() => {
            if (settled) return;
            if (stop) {
              // Settles through `finish` once the abort leaves it idle, with the partial reply.
              stoppedAtTimeout = true;
              void abort(path);
              return;
            }
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
  if (!isIdle(path)) fail('SESSION_BUSY', `session is running: ${path}`);
  await waitForRunStart(path, () => prompt(path, text));
}

/** Children with a notice already being watched, so a re-arm cannot subscribe twice. */
const watchedNoticePaths = new Set<string>();

/** Resolves once the child is idle (`false`) or its process is gone (`true`). */
function whenSubagentSettles(childPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (exited: boolean): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      offExit();
      resolve(exited);
    };
    const unsubscribe = getTranscriptController(childPath).subscribe(() => {
      if (isIdle(childPath)) finish(false);
    });
    const offExit = onSessionExit(childPath, () => finish(true));
    if (isIdle(childPath)) finish(false);
  });
}

/** Whether the child left an assistant message: a `pigi session wait` has something to print. */
async function childHasReply(childPath: string): Promise<boolean> {
  try {
    const { messages } = await readSessionMessages(childPath);
    return messages.some(
      (message: unknown) =>
        typeof message === 'object' &&
        message !== null &&
        Reflect.get(message, 'role') === 'assistant',
    );
  } catch {
    // No file: pi writes one with the first assistant message.
    return false;
  }
}

/** What became of the child: its failure, if any, and whether it left a reply. */
async function subagentOutcome(childPath: string, exited: boolean): Promise<SubagentOutcome> {
  const readable = await childHasReply(childPath);
  if (exited) return { failure: 'its session process exited', readable };
  try {
    await lastReply(childPath);
    // Idle and never said anything: it failed before its first message, which
    // is no reply rather than an empty one.
    return { failure: readable ? null : 'it produced no reply', readable };
  } catch (error) {
    // An abort is not the child's fault; the parent needs to know someone
    // stopped the run, not pi's stop reason.
    if (error instanceof RemoteCommandFailure && error.error.data.stopReason === 'aborted') {
      return { failure: 'the run was aborted', readable };
    }
    return { failure: error instanceof Error ? error.message : String(error), readable };
  }
}

/**
 * The parent hears about the child even when it had stopped meanwhile: it is
 * resumed, and the notice starts a fresh turn in it (docs/cli.md §10).
 *
 * Written as a custom message rather than a prompt, so the parent's transcript
 * shows a notice card instead of a turn the user appears to have typed. A
 * parent in the middle of a turn is not steered: the notice is queued as a
 * follow-up and gets a turn of its own when the current one ends.
 */
async function deliverSubagentNotice(
  notice: PendingSubagentNotice,
  exited: boolean,
): Promise<void> {
  const text = subagentNoticeText(notice, await subagentOutcome(notice.childPath, exited));
  try {
    await openSession(notice.parentPath);
    await sendCustomMessage(notice.parentPath, SUBAGENT_NOTICE_TYPE, text, {
      triggerTurn: true,
      deliverAs: 'followUp',
    });
  } catch (error) {
    console.error('subagent notice was not delivered:', error);
  }
}

async function watchSubagentNotice(notice: PendingSubagentNotice): Promise<void> {
  const { childPath } = notice;
  watchedNoticePaths.add(childPath);
  try {
    // A child whose process was pruned is resumed first: an unhydrated
    // transcript controller reads idle, and the notice would be premature.
    await openSession(childPath);
    await deliverSubagentNotice(notice, await whenSubagentSettles(childPath));
  } catch (error) {
    // Its session file is gone (deleted after it finished): nothing to report.
    console.error('subagent notice was dropped:', error);
  } finally {
    watchedNoticePaths.delete(childPath);
    // After the attempt, whatever came of it: a renderer that died mid-delivery
    // owes the notice again, one that delivered it owes nothing.
    forgetSubagentNotice(childPath);
  }
}

/** Arms a notice for a child that has just started running. */
function armSubagentNotice(notice: PendingSubagentNotice): void {
  rememberSubagentNotice(notice);
  void watchSubagentNotice(notice);
}

/** Re-arms the notices a reloaded or reopened window left pending. */
function resumeSubagentNotices(): void {
  for (const notice of pendingSubagentNotices()) {
    if (!watchedNoticePaths.has(notice.childPath)) void watchSubagentNotice(notice);
  }
}

const HANDLERS: { [M in HandledMethod]: Handler<M> } = {
  'session.list': async ({ cwd, all, running, subagent, parent }, { signal }) => {
    if (all && cwd !== undefined) fail('INVALID_PARAMS', 'pass --cwd or --all, not both');
    const parentSession = parent ? await resolveSession(parent, signal) : undefined;
    const projects = all
      ? await projectPaths()
      : [
          cwd ??
            parentSession?.cwd ??
            fail('INVALID_PARAMS', 'pass --cwd, --all or --parent', { param: 'cwd' }),
        ];
    const listed = await listProjects(projects, signal);
    const runningPaths = await runningSessionPaths();
    const { sessions: entries } = useAppStore.getState();
    const sessions = projects
      .flatMap((path) => getProjectSessions(path, listed, entries))
      .filter(
        (session) =>
          (!running || runningPaths.has(session.path)) &&
          (!subagent || session.isSubagent) &&
          (!parentSession || session.parentSessionPath === parentSession.path),
      );
    return { sessions: sessions.map((session) => summarize(session, runningPaths)) };
  },

  'session.create': async ({ cwd, parent, model, thinkingLevel }, { signal }) => {
    // With the project given, a parent file needs no lookup: it may be one pigi does not list.
    if (cwd && (!parent || isSessionFileRef(parent))) {
      return createBackgroundSession({ cwd, parent, model, thinkingLevel }, {});
    }
    const parentSession = parent ? await resolveSession(parent, signal) : undefined;
    const projectCwd =
      cwd ??
      parentSession?.cwd ??
      fail('INVALID_PARAMS', 'pass --cwd or --parent', { param: 'cwd' });
    return createBackgroundSession(
      { cwd: projectCwd, parent: parentSession?.path, model, thinkingLevel },
      {},
    );
  },

  'session.prompt': async ({ path, text }, { signal }) => {
    const session = await resolveSession(path, signal);
    await openSession(session.path);
    await promptSession(session.path, text);
    return { path: session.path };
  },

  'session.wait': async ({ path, timeout, stop }, { signal }) => {
    const session = await resolveSession(path, signal);
    await openSession(session.path);
    return waitForIdle(session.path, signal, { timeoutSeconds: timeout, stop });
  },

  'session.status': async ({ path }, { signal }) => {
    const session = await resolveSession(path, signal);
    // An open session answers from its process; any other from its file,
    // without starting a process to ask.
    const { messages } = useAppStore.getState().sessions.has(session.path)
      ? await getMessages(session.path)
      : await readSessionMessages(session.path);
    return {
      path: session.path,
      id: session.id,
      title: sessionTitle(session),
      running: (await runningSessionPaths()).has(session.path),
      messageCount: messages.length,
      ...latestAssistantActivity(messages),
    };
  },

  'session.abort': async ({ path }, { signal }) => {
    const session = await resolveSession(path, signal);
    if (!(await runningSessionPaths()).has(session.path)) {
      return { path: session.path, aborted: false };
    }
    await openSession(session.path);
    await abort(session.path);
    return { path: session.path, aborted: true };
  },

  'subagent.run': async (
    { task, parent, model, thinkingLevel, detach, notify, timeout },
    { signal, notify: sendNotification },
  ) => {
    if ((detach || notify) && timeout !== undefined) {
      fail(
        'INVALID_PARAMS',
        '--timeout needs the call to wait; it does not go with --detach or --notify',
        { param: 'timeout' },
      );
    }
    const parentSession = await resolveSession(parent, signal);
    if (parentSession.isSubagent) {
      fail('INVALID_PARAMS', 'a subagent cannot start subagents; do the task in this session', {
        param: 'parent',
      });
    }
    const title = chatMessageTitle(task, []);
    const created = await createBackgroundSession(
      { cwd: parentSession.cwd, parent: parentSession.path, model, thinkingLevel },
      { subagent: true, title },
    );
    if (signal.aborted) {
      void destroySession(created.path);
      fail('SESSION_FAILED', 'cancelled', { path: created.path });
    }
    sendNotification(SUBAGENT_STARTED_NOTIFICATION, created);
    await promptSession(created.path, task);
    // `notify` returns like `--detach`, and the parent gets its own turn when
    // the child finishes instead of holding this call open.
    if (notify) {
      armSubagentNotice({
        childPath: created.path,
        childId: created.id,
        parentPath: parentSession.path,
        title,
      });
      return created;
    }
    if (detach) return created;
    // `stop`: a caller that is gone (its bash call aborted) takes the reason to run with it.
    return {
      ...created,
      ...(await waitForIdle(created.path, signal, { timeoutSeconds: timeout, stop: true })),
    };
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
  resumeSubagentNotices();

  // Requests still running keep their sessions: a reload fails the request in
  // main, and the caller can `pigi session wait` on the path it was given.
  return () => {
    offCommand();
    offCancel();
  };
}
