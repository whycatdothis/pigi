/**
 * Turns the directories a task session touches into the task's directory
 * lists. Paths the user wrote (prompt text, attached files) become working
 * directories outright; paths tool calls touched become suggestions the
 * sidebar editor offers. Main re-validates everything against disk and the
 * task's tombstones, so extraction here can stay cheap and heuristic.
 *
 * Scanning follows the run live on a short interval, so a dir shows up right
 * after the message that mentioned it instead of at run end. A wall-clock
 * watermark decides what counts as new: hydrated history carries its original
 * (old) timestamps while live nodes are stamped with Date.now().
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
// History is hours old; the over-reach only re-reports the previous run's
// tail, which main dedupes against the task's existing lists.
const RUN_START_GRACE_MS = 10_000;
const SCAN_INTERVAL_MS = 1_500;

/** One run being followed: how far we scanned and what we already sent. */
interface RunWatch {
  watermark: number;
  reported: Set<string>;
  timer: ReturnType<typeof setInterval>;
  scanning: boolean;
}

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

async function scan(taskPath: string, sessionPath: string, watch: RunWatch): Promise<void> {
  const controller = peekTranscriptController(sessionPath);
  // A slow report must not stack ticks: paths are marked reported only after
  // the round trip, so two overlapping scans would double-report.
  if (!controller || watch.scanning) return;
  watch.scanning = true;
  try {
    const promptPaths = new Set<string>();
    const toolPaths = new Set<string>();
    let watermark = Date.now();
    for (const node of controller.state.nodes) {
      if (node.role === 'user') {
        if (node.sentAt < watch.watermark) continue;
        extractFromText(node.text, promptPaths);
        for (const filePath of node.filePaths ?? []) promptPaths.add(filePath);
      } else if (node.role === 'tool' && node.status !== 'cancelled') {
        if (node.startedAt === undefined || node.startedAt < watch.watermark) continue;
        // Tool args stream in while the call runs; scanning one now would read
        // truncated args and the watermark would never come back to it.
        if (node.status === 'running') {
          watermark = Math.min(watermark, node.startedAt);
          continue;
        }
        extractFromArgs(node.args, toolPaths);
      }
    }
    let settled = true;
    for (const [paths, source] of [
      [[...promptPaths], 'prompt'],
      [[...toolPaths], 'tool'],
    ] as const) {
      const fresh = paths
        .filter((path) => !watch.reported.has(`${source}:${path}`))
        .slice(0, MAX_PATHS_PER_REPORT);
      if (fresh.length === 0) continue;
      const result = await reportTaskDirs(taskPath, fresh, source);
      if (result.success) {
        for (const path of fresh) watch.reported.add(`${source}:${path}`);
        useAppStore.getState().upsertTask(result.task);
      } else {
        settled = false;
      }
    }
    // A failed report keeps the old watermark so its paths are retried.
    if (settled) watch.watermark = watermark;
  } finally {
    watch.scanning = false;
  }
}

/** Subscribes to session status changes; returns the unsubscribe for tests. */
export function startTaskDirSuggestions(): () => void {
  const watchBySession = new Map<string, RunWatch>();
  const statusBySession = new Map<string, AgentStatus>();

  const dropWatch = (sessionPath: string): void => {
    const watch = watchBySession.get(sessionPath);
    if (watch) clearInterval(watch.timer);
    watchBySession.delete(sessionPath);
  };

  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.sessions === previous.sessions) return;
    for (const [sessionPath, entry] of state.sessions) {
      const status = statusBySession.get(sessionPath) ?? 'idle';
      statusBySession.set(sessionPath, entry.status);
      const task = state.tasks.find((candidate) => candidate.path === entry.cwd);
      if (!task || status === entry.status) continue;
      if (isAgentBusy(entry.status) && !isAgentBusy(status)) {
        dropWatch(sessionPath);
        const watch: RunWatch = {
          watermark: Date.now() - RUN_START_GRACE_MS,
          reported: new Set(),
          timer: setInterval(() => void scan(task.path, sessionPath, watch), SCAN_INTERVAL_MS),
          scanning: false,
        };
        watchBySession.set(sessionPath, watch);
      } else if (!isAgentBusy(entry.status) && isAgentBusy(status)) {
        const watch = watchBySession.get(sessionPath);
        dropWatch(sessionPath);
        if (watch) void scan(task.path, sessionPath, watch);
      }
    }
    for (const sessionPath of statusBySession.keys()) {
      if (!state.sessions.has(sessionPath)) {
        statusBySession.delete(sessionPath);
        dropWatch(sessionPath);
      }
    }
  });
  return () => {
    unsubscribe();
    for (const sessionPath of [...watchBySession.keys()]) dropWatch(sessionPath);
  };
}
