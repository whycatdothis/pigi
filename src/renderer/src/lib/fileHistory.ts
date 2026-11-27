import type { LineRange } from './filePathCandidates';

/** A file the Files tab showed, and the lines it was opened at. */
export interface FileVisit {
  filePath: string;
  lines: LineRange | null;
}

/** Back/forward in the Files tab; `index` is the visit on screen. */
export interface FileHistory {
  visits: readonly FileVisit[];
  index: number;
}

const MAX_FILE_VISITS = 50;

export const EMPTY_FILE_HISTORY: FileHistory = { visits: [], index: -1 };

function sameLines(a: LineRange | null, b: LineRange | null): boolean {
  return a?.start === b?.start && a?.end === b?.end;
}

/**
 * Drops the forward visits, like a browser. A visit to the file on screen
 * replaces it while that visit has no lines, so marking where a jump starts
 * and reopening the file from the tree add nothing.
 */
export function addFileVisit(history: FileHistory, visit: FileVisit): FileHistory {
  const current = history.visits[history.index];
  if (current?.filePath === visit.filePath) {
    if (!visit.lines || sameLines(current.lines, visit.lines)) return history;
    if (!current.lines) {
      return { visits: [...history.visits.slice(0, history.index), visit], index: history.index };
    }
  }
  const visits = [...history.visits.slice(0, history.index + 1), visit].slice(-MAX_FILE_VISITS);
  return { visits, index: visits.length - 1 };
}

export function moveInFileHistory(history: FileHistory, step: -1 | 1): FileHistory | null {
  const index = history.index + step;
  return index >= 0 && index < history.visits.length ? { ...history, index } : null;
}
