/**
 * Run-end working-dir classification: one batched side call scores the
 * directories a run touched, so the confident ones can join the task's
 * working directories without waiting for the user. Runs on the session's
 * own worker (a new control-port command), so the provider path the run and
 * auto-rename already warmed is reused — no cold start, no extra process.
 *
 * Mirrors autoRename.ts: cheapest models first, the same completeSimple
 * call, the same before_provider_headers transform providers like Cursor
 * require. Returns null when no model can answer; the caller then keeps its
 * heuristic behavior, so a failed classification is never a regression.
 */
import type { Api, Model, ProviderHeaders } from '@earendil-works/pi-ai';
import type { ExtensionRunner, ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { TaskDirCandidate, TaskDirEvent, TaskDirVerdict } from '../../shared/ipcContract';
import { getCandidatesByCost, getCheapestSameProvider, MAX_GLOBAL_ATTEMPTS } from './autoRename';

export interface ClassifyTaskDirsInput {
  taskName: string;
  workDirs: string[];
  historyDirs: string[];
  dirLog: TaskDirEvent[];
  candidates: TaskDirCandidate[];
}

// Beyond these caps the prompt grows faster than the verdicts improve; the
// renderer stays under them anyway, so hitting them here means a buggy caller.
const MAX_CANDIDATES = 30;
const MAX_DIR_LOG_EVENTS = 20;
const MAX_HISTORY_DIRS = 30;
const MAX_VERDICT_TOKENS = 1024;

const SYSTEM_PROMPT = `You decide which directories belong to a software task's working set — the places the task's sessions actually edit and run in. You are given the task, its history, and candidate directories with the context in which each appeared. Score every candidate with p, the probability it belongs to the working set. Directories merely read for reference, dependencies, caches, temp or output locations score low. Answer with ONLY a JSON array like [{"dir": "/x/y", "p": 0.9}], one entry per candidate, no prose.`;

function formatEvents(dirLog: TaskDirEvent[]): string {
  if (dirLog.length === 0) return '(none)';
  return dirLog
    .slice(-MAX_DIR_LOG_EVENTS)
    .map((event) => `- ${event.action} ${event.dir} (${event.source})`)
    .join('\n');
}

function formatCandidates(candidates: TaskDirCandidate[]): string {
  return candidates
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.dir} — seen in ${candidate.seenIn}: ${candidate.context}`,
    )
    .join('\n');
}

function buildPrompt(input: ClassifyTaskDirsInput): string {
  const candidates = input.candidates.slice(0, MAX_CANDIDATES);
  return [
    `Task: "${input.taskName}"`,
    '',
    'Current working directories:',
    input.workDirs.length > 0 ? input.workDirs.map((dir) => `- ${dir}`).join('\n') : '(none)',
    '',
    "Working directories from the user's other tasks:",
    input.historyDirs.length > 0
      ? input.historyDirs
          .slice(0, MAX_HISTORY_DIRS)
          .map((dir) => `- ${dir}`)
          .join('\n')
      : '(none)',
    '',
    'Directory edit history (what the user and past verdicts kept or rejected):',
    formatEvents(input.dirLog),
    '',
    'Candidates:',
    formatCandidates(candidates),
  ].join('\n');
}

/** Pulls the JSON array out of the answer; models that wrap it in prose or a fence still parse. */
export function parseVerdicts(text: string): TaskDirVerdict[] | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const verdicts: TaskDirVerdict[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (!('dir' in entry) || !('p' in entry)) continue;
    const { dir, p } = entry;
    if (typeof dir !== 'string' || typeof p !== 'number' || Number.isNaN(p)) continue;
    verdicts.push({ dir, p: Math.min(1, Math.max(0, p)) });
  }
  return verdicts.length > 0 ? verdicts : null;
}

async function tryClassify(
  model: Model<Api>,
  prompt: string,
  modelRuntime: ModelRuntime,
  transformHeaders?: (headers: ProviderHeaders) => Promise<ProviderHeaders>,
): Promise<TaskDirVerdict[] | null> {
  try {
    const result = await modelRuntime.completeSimple(
      model,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
      },
      {
        maxTokens: MAX_VERDICT_TOKENS,
        temperature: 0.2,
        transformHeaders,
      },
    );
    if (result.stopReason === 'error') return null;
    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');
    return parseVerdicts(text);
  } catch {
    return null;
  }
}

export async function classifyTaskDirs(
  input: ClassifyTaskDirsInput,
  modelRuntime: ModelRuntime,
  sessionProvider?: string,
  extensionRunner?: ExtensionRunner,
): Promise<TaskDirVerdict[] | null> {
  if (input.candidates.length === 0) return [];
  const available = await modelRuntime.getAvailable();
  const candidates = getCandidatesByCost(available);
  if (candidates.length === 0) return null;

  // Providers like Cursor reject bare completeSimple calls unless the request
  // went through their before_provider_headers handler (same as the agent loop).
  const transformHeaders =
    extensionRunner && extensionRunner.hasHandlers('before_provider_headers')
      ? (headers: ProviderHeaders) => extensionRunner.emitBeforeProviderHeaders(headers)
      : undefined;

  const prompt = buildPrompt(input);

  const tried = new Set<string>();
  let attempts = 0;
  for (const model of candidates) {
    if (attempts >= MAX_GLOBAL_ATTEMPTS) break;
    const key = model.provider + '/' + model.id;
    if (tried.has(key)) continue;
    tried.add(key);
    attempts++;

    const verdicts = await tryClassify(model, prompt, modelRuntime, transformHeaders);
    if (verdicts) return verdicts;
  }

  // The session's own provider is known to work.
  if (sessionProvider) {
    const fallback = getCheapestSameProvider(candidates, sessionProvider);
    if (fallback && !tried.has(fallback.provider + '/' + fallback.id)) {
      return tryClassify(fallback, prompt, modelRuntime, transformHeaders);
    }
  }

  return null;
}
