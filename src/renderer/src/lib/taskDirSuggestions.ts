/**
 * Turns the directories a task session touches into the task's directory
 * lists. Paths the user typed into the prompt become working directories
 * outright; attached files and paths observed in tool calls and assistant
 * messages are classified first, with heuristic suggestions as the floor.
 * Main re-validates everything against disk and the task's tombstones, so
 * extraction here can stay cheap and heuristic.
 *
 * Scanning follows the run live on a short interval, so a dir shows up right
 * after the message that mentioned it instead of at run end. A wall-clock
 * watermark decides what counts as new: hydrated history carries its original
 * (old) timestamps while live nodes are stamped with Date.now().
 *
 * Classification doesn't wait for the run: every CLASSIFY_BATCH_SIZE
 * unclassified candidates trigger one batched call on the session's own
 * worker (a side call beside the running agent, provider already warm), and
 * whatever is left gets a forced pass at run end. Verdicts above
 * AUTO_ADD_PROBABILITY are reported as 'model' adds; everything below simply
 * stays a suggestion, and a failed classification changes nothing, so the
 * heuristics alone are the floor.
 */
import { isAgentBusy, useAppStore, type AgentStatus } from '../state/appStore';
import { peekTranscriptController } from '../hooks/useTranscript';
import { classifyTaskDirs, reportTaskDirs } from '../services/piAgentClient';
import type { TaskDirCandidate } from '../../../shared/ipcContract';
import { TASK_DIR_CLASSIFY_MAX_CANDIDATES } from '../../../shared/ipcContract';

/** A path token in free text or a shell command: `/x/y` or `~/x/y`. */
const PATH_TOKEN_PATTERN = /(?:^|[\s"'`(=,])((?:\/|~\/)[^\s"'`)=,;&|]+)/g;
const MAX_PATHS_PER_REPORT = 50;
const MAX_ARGS_DEPTH = 4;
/** Half the window kept around a mention, so the classifier sees how the dir was used. */
const CONTEXT_RADIUS = 120;
/** Verdicts at or above this probability become working directories outright. */
const AUTO_ADD_PROBABILITY = 0.8;
/** Unclassified candidates that trigger a mid-run batch, so long runs promote as they go. */
const CLASSIFY_BATCH_SIZE = 10;
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
  /** Observed dirs with their first-seen context, accumulated for classification. */
  candidates: Map<string, TaskDirCandidate>;
  /** Dirs sent (or being sent) for classification; never sent twice in one run. */
  classified: Set<string>;
  classifying: boolean;
  runEnded: boolean;
  timer: ReturnType<typeof setInterval>;
  scanning: boolean;
  /** Scans run strictly in order behind this promise; see enqueueScan. */
  scanChain: Promise<void>;
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
        // An attached file is weaker evidence than a typed path: it goes to
        // the classifier, never to an outright add.
        for (const filePath of node.filePaths ?? []) {
          observedPaths.add(filePath);
          if (!watch.candidates.has(filePath)) {
            watch.candidates.set(filePath, {
              dir: filePath,
              seenIn: 'prompt',
              context: 'attached file',
            });
          }
        }
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
 * Scans run strictly in order: a scan's early return while another is in
 * flight would strand the run-end scan (the tail between the in-flight
 * scan's start and the idle flip would never be scanned or classified), so
 * a caller finding a scan in flight queues behind it. With none in flight
 * the scan starts synchronously, exactly like a direct call.
 */
function enqueueScan(taskPath: string, sessionPath: string, watch: RunWatch): Promise<void> {
  const next = watch.scanning
    ? watch.scanChain.then(() => scan(taskPath, sessionPath, watch))
    : Promise.resolve(scan(taskPath, sessionPath, watch));
  watch.scanChain = next.catch(() => undefined);
  return watch.scanChain;
}

/**
 * One batched scoring pass over a subset of the run's candidates, promoting
 * the confident ones. Conservative by construction — verdicts below the
 * threshold, failed calls and dirs the model invented all leave the
 * heuristic suggestions as-is.
 */
async function classifyRun(
  sessionPath: string,
  taskPath: string,
  dirs: string[],
  candidates: Map<string, TaskDirCandidate>,
): Promise<void> {
  const state = useAppStore.getState();
  // The run's own reports already mutated the task, so read it fresh.
  const task = state.tasks.find((candidate) => candidate.path === taskPath);
  if (!task) return;
  const batch = dirs.flatMap((dir) => {
    const candidate = candidates.get(dir);
    return candidate && !task.workDirs.includes(candidate.dir) ? [candidate] : [];
  });
  if (batch.length === 0) return;
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
    candidates: batch,
  }).catch(() => null);
  if (!result?.success) return;
  // Only observed dirs can be promoted: a confident hallucination stays a no-op.
  const batchDirs = new Set(batch.map((candidate) => candidate.dir));
  const promoted = result.verdicts
    .filter((verdict) => verdict.p >= AUTO_ADD_PROBABILITY && batchDirs.has(verdict.dir))
    .map((verdict) => verdict.dir);
  if (promoted.length === 0) return;
  // 'model' goes through the same disk/tombstone validation as the user's own
  // words; main is the last word on what actually lands.
  const reported = await reportTaskDirs(taskPath, promoted, 'model').catch(() => null);
  if (reported?.success) useAppStore.getState().upsertTask(reported.task);
}

/**
 * Fires a batch when enough unclassified candidates piled up — or when forced
 * at run end, however small the tail. One call in flight at a time; a run
 * that ended under an in-flight batch gets its tail scored right after.
 */
function maybeClassify(
  sessionPath: string,
  taskPath: string,
  watch: RunWatch,
  force: boolean,
): void {
  if (watch.classifying) return;
  const pending = [...watch.candidates.keys()].filter((dir) => !watch.classified.has(dir));
  if (pending.length === 0 || (!force && pending.length < CLASSIFY_BATCH_SIZE)) return;
  watch.classifying = true;
  // The classifier caps its prompt; the overflow stays unclassified for the
  // next batch (or the forced run-end pass) instead of being silently dropped.
  const batch = pending.slice(0, TASK_DIR_CLASSIFY_MAX_CANDIDATES);
  for (const dir of batch) watch.classified.add(dir);
  void classifyRun(sessionPath, taskPath, batch, watch.candidates).finally(() => {
    watch.classifying = false;
    if (watch.runEnded) maybeClassify(sessionPath, taskPath, watch, true);
  });
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
          classified: new Set(),
          classifying: false,
          runEnded: false,
          timer: setInterval(() => {
            void enqueueScan(task.path, sessionPath, watch).then(() =>
              maybeClassify(sessionPath, task.path, watch, false),
            );
          }, SCAN_INTERVAL_MS),
          scanning: false,
          scanChain: Promise.resolve(),
        };
        watchBySession.set(sessionPath, watch);
      } else if (!isAgentBusy(entry.status) && isAgentBusy(status)) {
        const watch = watchBySession.get(sessionPath);
        dropWatch(sessionPath);
        if (watch) {
          watch.runEnded = true;
          void enqueueScan(task.path, sessionPath, watch).then(() =>
            maybeClassify(sessionPath, task.path, watch, true),
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
