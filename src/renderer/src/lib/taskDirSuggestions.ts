/**
 * Turns the directories a task session touches into the task's directory
 * lists. Paths the user wrote (prompt text, attached files) become working
 * directories outright; paths observed in tool calls and assistant messages
 * become suggestions the sidebar editor offers. Main re-validates everything
 * against disk and the task's tombstones, so extraction here can stay cheap
 * and heuristic.
 *
 * Scanning follows the run live on a short interval, so a dir shows up right
 * after the message that mentioned it instead of at run end. A wall-clock
 * watermark decides what counts as new: hydrated history carries its original
 * (old) timestamps while live nodes are stamped with Date.now().
 *
 * When the run ends, the observed dirs — each with the snippet of text that
 * mentioned it — go through one batched LLM classification on the session's
 * own worker (provider already warm from the run). Verdicts above
 * AUTO_ADD_PROBABILITY are reported as 'model' adds; everything below simply
 * stays a suggestion, and a failed classification changes nothing, so the
 * heuristics alone are the floor.
 */
import { isAgentBusy, useAppStore, type AgentStatus } from '../state/appStore';
import { peekTranscriptController } from '../hooks/useTranscript';
import { classifyTaskDirs, reportTaskDirs } from '../services/piAgentClient';
import type { TaskDirCandidate } from '../../../shared/ipcContract';

/** A path token in free text or a shell command: `/x/y` or `~/x/y`. */
const PATH_TOKEN_PATTERN = /(?:^|[\s"'`(=,])((?:\/|~\/)[^\s"'`)=,;&|]+)/g;
const MAX_PATHS_PER_REPORT = 50;
const MAX_ARGS_DEPTH = 4;
/** Half the window kept around a mention, so the classifier sees how the dir was used. */
const CONTEXT_RADIUS = 120;
/** Verdicts at or above this probability become working directories outright. */
const AUTO_ADD_PROBABILITY = 0.8;
// The optimistic user node lands in the transcript just before the session
// status flips to busy, so the watermark must reach slightly into the past.
// History is hours old; the over-reach only re-reports the previous run's
// tail, which main dedupes against the task's existing lists.
const RUN_START_GRACE_MS = 10_000;
const SCAN_INTERVAL_MS = 1_500;

/** One run being followed: how far we scanned, what we already sent. */
interface RunWatch {
  watermark: number;
  reported: Set<string>;
  /** Observed dirs with their first-seen context, accumulated for the run-end classification. */
  candidates: Map<string, TaskDirCandidate>;
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

function contextAround(text: string, index: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + CONTEXT_RADIUS);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/** Like extractFromText, but keeps the mention's surroundings for the classifier. */
function collectCandidates(
  text: string,
  seenIn: TaskDirCandidate['seenIn'],
  into: Map<string, TaskDirCandidate>,
): void {
  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match[1].replace(/[.:;!?]+$/, '');
    // First context wins: how the dir came up first is the honest summary.
    if (token.length > 1 && !into.has(token)) {
      into.set(token, { dir: token, seenIn, context: contextAround(text, match.index) });
    }
  }
}

function extractFromArgs(
  args: unknown,
  into: Set<string>,
  candidates: Map<string, TaskDirCandidate>,
  depth = 0,
): void {
  if (depth > MAX_ARGS_DEPTH || args === null || args === undefined) return;
  if (typeof args === 'string') {
    extractFromText(args, into);
    collectCandidates(args, 'tool', candidates);
    return;
  }
  if (Array.isArray(args)) {
    for (const item of args) extractFromArgs(item, into, candidates, depth + 1);
    return;
  }
  if (typeof args === 'object') {
    for (const value of Object.values(args)) extractFromArgs(value, into, candidates, depth + 1);
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
    const observedPaths = new Set<string>();
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
        extractFromArgs(node.args, observedPaths, watch.candidates);
      } else if (node.role === 'assistant') {
        if (node.messageStartedAt === undefined || node.messageStartedAt < watch.watermark) {
          continue;
        }
        // Same streaming hazard as running tools: the text is still growing.
        if (node.isStreaming) {
          watermark = Math.min(watermark, node.messageStartedAt);
          continue;
        }
        extractFromText(node.text, observedPaths);
        collectCandidates(node.text, 'assistant', watch.candidates);
      }
    }
    let settled = true;
    for (const [paths, source] of [
      [[...promptPaths], 'prompt'],
      [[...observedPaths], 'tool'],
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

/**
 * The run-end pass: score everything the run observed in one batched call and
 * promote the confident ones. Conservative by construction — verdicts below
 * the threshold and failed calls both leave the heuristic suggestions as-is.
 */
async function classifyRun(sessionPath: string, taskPath: string, watch: RunWatch): Promise<void> {
  if (watch.candidates.size === 0) return;
  const state = useAppStore.getState();
  // The run's own reports already mutated the task, so read it fresh.
  const task = state.tasks.find((candidate) => candidate.path === taskPath);
  if (!task) return;
  const candidates = [...watch.candidates.values()].filter(
    (candidate) => !task.workDirs.includes(candidate.dir),
  );
  if (candidates.length === 0) return;
  const historyDirs = [
    ...new Set(
      state.tasks.filter((other) => other.path !== taskPath).flatMap((other) => other.workDirs),
    ),
  ];
  // A dead worker (session closed) rejects; suggestions stand.
  const result = await classifyTaskDirs(sessionPath, {
    taskName: task.name,
    workDirs: task.workDirs,
    historyDirs,
    dirLog: task.dirLog,
    candidates,
  }).catch(() => null);
  if (!result?.success) return;
  // Only observed dirs can be promoted: a confident hallucination stays a no-op.
  const candidateDirs = new Set(candidates.map((candidate) => candidate.dir));
  const promoted = result.verdicts
    .filter((verdict) => verdict.p >= AUTO_ADD_PROBABILITY && candidateDirs.has(verdict.dir))
    .map((verdict) => verdict.dir);
  if (promoted.length === 0) return;
  // 'model' goes through the same disk/tombstone validation as the user's own
  // words; main is the last word on what actually lands.
  const reported = await reportTaskDirs(taskPath, promoted, 'model');
  if (reported.success) useAppStore.getState().upsertTask(reported.task);
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
          candidates: new Map(),
          timer: setInterval(() => void scan(task.path, sessionPath, watch), SCAN_INTERVAL_MS),
          scanning: false,
        };
        watchBySession.set(sessionPath, watch);
      } else if (!isAgentBusy(entry.status) && isAgentBusy(status)) {
        const watch = watchBySession.get(sessionPath);
        dropWatch(sessionPath);
        if (watch) {
          void scan(task.path, sessionPath, watch).then(() =>
            classifyRun(sessionPath, task.path, watch),
          );
        }
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
