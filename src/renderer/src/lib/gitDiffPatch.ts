import { diffWordsWithSpace } from 'diff';

export interface GitDiffSourceLine {
  kind: 'context' | 'add' | 'remove';
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

/** Unchanged lines a patch leaves out before a hunk: new-file lines `newStart..newEnd`, where null runs to the end of the file. */
export interface GitDiffGap {
  oldStart: number;
  newStart: number;
  newEnd: number | null;
}

export type GitDiffPatchLine =
  | GitDiffSourceLine
  | { kind: 'hunk'; text: string; gap: GitDiffGap }
  | { kind: 'meta'; text: string };

/** A collapsed gap as drawn: the hunk's function context, and how many lines expanding it reveals. */
export interface GitDiffGapRow {
  kind: 'gap';
  hunkIndex: number;
  text: string;
  hiddenLines: number;
}

export type GitDiffRow = GitDiffSourceLine | GitDiffGapRow | { kind: 'meta'; text: string };

export type GitDiffSplitRow =
  | { kind: 'pair'; left: GitDiffSourceLine | null; right: GitDiffSourceLine | null }
  | GitDiffGapRow
  | { kind: 'meta'; text: string };

const HUNK_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

export function isSourceLine(line: { kind: string }): line is GitDiffSourceLine {
  return line.kind === 'add' || line.kind === 'remove' || line.kind === 'context';
}

/**
 * Turn a unified git patch into rows the viewer can draw. File headers are
 * omitted; hunk headers carry the unchanged lines hidden before them, and a
 * trailing header-less hunk carries the lines after the last one.
 */
export function parseGitPatch(patch: string): GitDiffPatchLine[] {
  const lines = patch.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const parsed: GitDiffPatchLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let inHunk = false;
  let sawHunk = false;

  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const match = HUNK_PATTERN.exec(raw);
      if (!match) {
        parsed.push({ kind: 'meta', text: raw });
        continue;
      }
      // A side with a zero count names the line before the change, so the
      // first line after it is one further on.
      const oldStart = Number(match[1]) + (match[2] === '0' ? 1 : 0);
      const newStart = Number(match[3]) + (match[4] === '0' ? 1 : 0);
      // Only the function context after the header is worth showing.
      parsed.push({
        kind: 'hunk',
        text: match[5],
        gap: { oldStart: oldLine, newStart: newLine, newEnd: newStart - 1 },
      });
      oldLine = oldStart;
      newLine = newStart;
      inHunk = true;
      sawHunk = true;
      continue;
    }

    if (!inHunk) {
      if (raw.startsWith('Binary files ')) parsed.push({ kind: 'meta', text: raw });
      continue;
    }

    if (raw.startsWith('\\ No newline')) {
      parsed.push({ kind: 'meta', text: 'No newline at end of file' });
    } else if (raw.startsWith('+')) {
      parsed.push({ kind: 'add', text: raw.slice(1), oldLineNumber: null, newLineNumber: newLine });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      parsed.push({
        kind: 'remove',
        text: raw.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      oldLine += 1;
    } else if (raw.startsWith(' ')) {
      parsed.push({
        kind: 'context',
        text: raw.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine += 1;
      newLine += 1;
    } else {
      inHunk = false;
    }
  }

  if (sawHunk) {
    parsed.push({
      kind: 'hunk',
      text: '',
      gap: { oldStart: oldLine, newStart: newLine, newEnd: null },
    });
  }
  return parsed;
}

/** A file's lines, without the empty entry a trailing newline leaves. */
export function splitFileLines(content: string): string[] {
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  return lines;
}

/**
 * The rows to draw: gaps in `expanded` (or every gap, for the whole file) are
 * replaced by the unchanged lines from the new file. Without the new file a
 * gap cannot be expanded and only its header shows.
 */
export function buildDiffRows(
  lines: readonly GitDiffPatchLine[],
  newFileLines: readonly string[] | null,
  expanded: ReadonlySet<number> | 'all',
): GitDiffRow[] {
  const rows: GitDiffRow[] = [];
  lines.forEach((line, index) => {
    if (line.kind !== 'hunk') {
      rows.push(line);
      return;
    }
    const { gap } = line;
    const end = newFileLines
      ? Math.min(gap.newEnd ?? newFileLines.length, newFileLines.length)
      : gap.newStart - 1;
    const hiddenLines = Math.max(0, end - gap.newStart + 1);
    if (newFileLines && hiddenLines > 0 && (expanded === 'all' || expanded.has(index))) {
      for (let number = gap.newStart; number <= end; number += 1) {
        rows.push({
          kind: 'context',
          text: newFileLines[number - 1],
          oldLineNumber: gap.oldStart + (number - gap.newStart),
          newLineNumber: number,
        });
      }
      return;
    }
    // The whole file needs no headers, unless there is no file to fill the gaps.
    if (hiddenLines > 0 || (line.text && (expanded !== 'all' || !newFileLines))) {
      rows.push({ kind: 'gap', hunkIndex: index, text: line.text, hiddenLines });
    }
  });
  return rows;
}

/** Side-by-side rows: each run of removed lines faces the added lines that replaced it. */
export function pairSplitRows(rows: readonly GitDiffRow[]): GitDiffSplitRow[] {
  const paired: GitDiffSplitRow[] = [];
  let removed: GitDiffSourceLine[] = [];
  let added: GitDiffSourceLine[] = [];
  const flush = (): void => {
    for (let index = 0; index < Math.max(removed.length, added.length); index += 1) {
      paired.push({ kind: 'pair', left: removed[index] ?? null, right: added[index] ?? null });
    }
    removed = [];
    added = [];
  };
  for (const row of rows) {
    if (!isSourceLine(row)) {
      flush();
      paired.push(row);
    } else if (row.kind === 'remove') {
      removed.push(row);
    } else if (row.kind === 'add') {
      added.push(row);
    } else {
      flush();
      paired.push({ kind: 'pair', left: row, right: row });
    }
  }
  flush();
  return paired;
}

/** A changed span of one line's text, `[start, end)`. */
export type ChangedRange = readonly [number, number];

// Past this a word diff of one line is slow (minified code) and unreadable anyway.
const MAX_WORD_DIFF_LINE_LENGTH = 500;
// Below this share of unchanged text the line was rewritten, and marking
// nearly all of it says no more than the row colour already does.
const MIN_UNCHANGED_SHARE = 0.4;

/**
 * The words that changed between each removed line and the added line facing
 * it (the same pairing as side by side), keyed by line. Leading whitespace is
 * never marked, so a re-indented line only marks what else changed.
 */
export function changedRanges(
  lines: readonly GitDiffPatchLine[],
): Map<GitDiffSourceLine, ChangedRange[]> {
  const ranges = new Map<GitDiffSourceLine, ChangedRange[]>();
  let removed: GitDiffSourceLine[] = [];
  let added: GitDiffSourceLine[] = [];
  const flush = (): void => {
    for (let index = 0; index < Math.min(removed.length, added.length); index += 1) {
      const pair = wordRanges(removed[index].text, added[index].text);
      if (!pair) continue;
      ranges.set(removed[index], pair.old);
      ranges.set(added[index], pair.new);
    }
    removed = [];
    added = [];
  };
  for (const line of lines) {
    if (line.kind === 'remove') {
      // A removed line after added ones starts a new run.
      if (added.length > 0) flush();
      removed.push(line);
    } else if (line.kind === 'add') {
      added.push(line);
    } else {
      flush();
    }
  }
  flush();
  return ranges;
}

function wordRanges(
  oldText: string,
  newText: string,
): { old: ChangedRange[]; new: ChangedRange[] } | null {
  if (
    oldText === newText ||
    oldText.length > MAX_WORD_DIFF_LINE_LENGTH ||
    newText.length > MAX_WORD_DIFF_LINE_LENGTH
  ) {
    return null;
  }
  const oldRanges: ChangedRange[] = [];
  const newRanges: ChangedRange[] = [];
  let oldOffset = 0;
  let newOffset = 0;
  let unchanged = 0;
  const oldIndent = leadingWhitespace(oldText);
  const newIndent = leadingWhitespace(newText);
  // `diffWords` reports an unchanged part with the new side's whitespace, which
  // shifts every old offset after a re-indent; with whitespace as tokens both
  // sides' parts are exact.
  for (const part of diffWordsWithSpace(oldText, newText)) {
    const length = part.value.length;
    if (part.removed) {
      pushRange(oldRanges, Math.max(oldOffset, oldIndent), oldOffset + length);
      oldOffset += length;
    } else if (part.added) {
      pushRange(newRanges, Math.max(newOffset, newIndent), newOffset + length);
      newOffset += length;
    } else {
      unchanged += part.value.trim().length;
      oldOffset += length;
      newOffset += length;
    }
  }
  const longer = Math.max(oldText.trim().length, newText.trim().length);
  if (longer === 0 || unchanged / longer < MIN_UNCHANGED_SHARE) return null;
  return { old: oldRanges, new: newRanges };
}

function pushRange(ranges: ChangedRange[], start: number, end: number): void {
  if (start < end) ranges.push([start, end]);
}

function leadingWhitespace(text: string): number {
  return text.length - text.trimStart().length;
}
