/**
 * The "your subagent finished" notices owed to a parent session by
 * `pigi subagent --notify` (docs/cli.md §10).
 *
 * The child runs in its own process, which outlives a reload, a crash or a
 * closed window, so a notice has to outlive them too: a pending one is kept in
 * localStorage and re-armed by the next renderer, and stays pending until a
 * delivery attempt has run its course.
 */
import { clipText, toSingleLine } from '../../../shared/messageText';

const STORAGE_KEY = 'pigi.pendingSubagentNotices';
const TITLE_LENGTH = 60;
const REASON_LENGTH = 160;

/** The custom message type a notice is written as: the transcript labels the card
 *  with it, and the parent does not have to be told who wrote what. */
export const SUBAGENT_NOTICE_TYPE = 'pigi.notice';

export interface PendingSubagentNotice {
  childPath: string;
  /** The child's session id: what the notice tells the parent to wait on. */
  childId: string;
  parentPath: string;
  /** The task, so the parent can tell which child finished. */
  title: string;
}

function isNotice(value: unknown): value is PendingSubagentNotice {
  if (typeof value !== 'object' || value === null) return false;
  return (
    typeof Reflect.get(value, 'childPath') === 'string' &&
    typeof Reflect.get(value, 'childId') === 'string' &&
    typeof Reflect.get(value, 'parentPath') === 'string' &&
    typeof Reflect.get(value, 'title') === 'string'
  );
}

export function pendingSubagentNotices(): PendingSubagentNotice[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isNotice) : [];
  } catch {
    return [];
  }
}

function write(notices: readonly PendingSubagentNotice[]): void {
  if (notices.length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(notices));
}

/** Adds a notice, replacing the one already owed for the same child. */
export function rememberSubagentNotice(notice: PendingSubagentNotice): void {
  write([
    ...pendingSubagentNotices().filter((pending) => pending.childPath !== notice.childPath),
    notice,
  ]);
}

export function forgetSubagentNotice(childPath: string): void {
  write(pendingSubagentNotices().filter((pending) => pending.childPath !== childPath));
}

/** Why the child failed and whether it left anything to read (docs/cli.md §10). */
export interface SubagentOutcome {
  /** What went wrong, or null when it stopped normally. */
  failure: string | null;
  /** Whether a `pigi session wait` can print anything: it has an assistant message. */
  readable: boolean;
}

/**
 * One line the parent can act on: which child, what became of it, and the
 * command that reads its reply. The reply itself stays in the child session —
 * it can be as long as the model likes, and the parent is not obliged to read
 * it back into its context.
 */
export function subagentNoticeText(
  notice: PendingSubagentNotice,
  outcome: SubagentOutcome,
): string {
  const title = clipText(toSingleLine(notice.title), TITLE_LENGTH);
  const result =
    outcome.failure === null
      ? 'finished'
      : `failed: ${clipText(toSingleLine(outcome.failure), REASON_LENGTH)}`;
  const read = outcome.readable
    ? `What it produced is not included here; read it with: pigi session wait ${notice.childId}`
    : 'There is nothing to read.';
  return `pigi: subagent ${notice.childId} ("${title}") ${result}. ${read}`;
}
