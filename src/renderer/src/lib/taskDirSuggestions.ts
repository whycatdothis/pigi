/**
 * Turns the directories a task session touches into the task's directory
 * lists. Paths the user wrote (prompt text, attached files) become working
 * directories outright; paths tool calls touched become suggestions the
 * sidebar editor offers. Main re-validates everything against disk and the
 * task's tombstones, so extraction here can stay cheap and heuristic.
 *
 * Only nodes from the witnessed run are scanned: a wall-clock watermark at
 * run start, because hydrated history carries its original (old) timestamps
 * while live nodes are stamped with Date.now(). An index cursor would break
 * whenever hydration prepends history mid-run.
 */
import { isAgentBusy, useAppStore, type AgentStatus } from '../state/appStore';
import { peekTranscriptController } from '../hooks/useTranscript';
import { reportTaskDirs } from '../services/piAgentClient';

/** A path token in free text or a shell command: `/x/y` or `~/x/y`. */
const PATH_TOKEN_PATTERN = /(?:^|[\s"'`(=,])((?:\/|~\/)[^\s"'`)=,;&|]+)/g;
const MAX_PATHS_PER_REPORT = 50;
const MAX_ARGS_DEPTH = 4;
// The optimistic user node lands in the transcript just before the session
// status flips to busy, so the watermark must reach slightly into the past.
// History is hours old; a few seconds of over-reach only re-reports dirs the
// main side dedupes anyway.
const RUN_START_GRACE_MS = 10_000;

function extractFromText(text: string, into: Set<string>): void {
  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    // Sentence punctuation clings to tokens; a trailing slash is normalized in main.
    const token = match[1].replace(/[.:;!?]+$/, '');
    if (token.length > 1) into.add(token);
  }
}

function extractFromArgs(args: unknown, into: Set<string>, depth = 0): void {
  if (depth > MAX_ARGS_DEPTH || args === null || args === undefined) return;
  if (typeof args === 'string') {
    extractFromText(args, into);
    return;
  }
  if (Array.isArray(args)) {
    for (const item of args) extractFromArgs(item, into, depth + 1);
    return;
  }
  if (typeof args === 'object') {
    for (const value of Object.values(args)) extractFromArgs(value, into, depth + 1);
  }
}

async function scanRun(taskPath: string, sessionPath: string, runStartedAt: number): Promise<void> {
  const controller = peekTranscriptController(sessionPath);
  if (!controller) return;
  const since = runStartedAt - RUN_START_GRACE_MS;
  const promptPaths = new Set<string>();
  const toolPaths = new Set<string>();
  for (const node of controller.state.nodes) {
    if (node.role === 'user') {
      if (node.sentAt < since) continue;
      extractFromText(node.text, promptPaths);
      for (const filePath of node.filePaths ?? []) promptPaths.add(filePath);
    } else if (node.role === 'tool' && node.status !== 'cancelled') {
      if (node.startedAt === undefined || node.startedAt < since) continue;
      extractFromArgs(node.args, toolPaths);
    }
  }
  const cap = (paths: Set<string>): string[] => [...paths].slice(0, MAX_PATHS_PER_REPORT);
  for (const [paths, source] of [
    [cap(promptPaths), 'prompt'],
    [cap(toolPaths), 'tool'],
  ] as const) {
    if (paths.length === 0) continue;
    const result = await reportTaskDirs(taskPath, paths, source);
    if (result.success) useAppStore.getState().upsertTask(result.task);
  }
}

/** Subscribes to session status changes; returns the unsubscribe for tests. */
export function startTaskDirSuggestions(): () => void {
  // Wall-clock start of the run being watched, per session.
  const runStartedAtBySession = new Map<string, number>();
  const statusBySession = new Map<string, AgentStatus>();

  return useAppStore.subscribe((state, previous) => {
    if (state.sessions === previous.sessions) return;
    for (const [sessionPath, entry] of state.sessions) {
      const status = statusBySession.get(sessionPath) ?? 'idle';
      statusBySession.set(sessionPath, entry.status);
      const task = state.tasks.find((candidate) => candidate.path === entry.cwd);
      if (!task || status === entry.status) continue;
      if (isAgentBusy(entry.status) && !isAgentBusy(status)) {
        runStartedAtBySession.set(sessionPath, Date.now());
      } else if (!isAgentBusy(entry.status) && isAgentBusy(status)) {
        const runStartedAt = runStartedAtBySession.get(sessionPath);
        runStartedAtBySession.delete(sessionPath);
        if (runStartedAt !== undefined) void scanRun(task.path, sessionPath, runStartedAt);
      }
    }
    for (const sessionPath of statusBySession.keys()) {
      if (!state.sessions.has(sessionPath)) {
        statusBySession.delete(sessionPath);
        runStartedAtBySession.delete(sessionPath);
      }
    }
  });
}
