export interface GitDiffPatchLine {
  kind: 'context' | 'add' | 'remove' | 'hunk' | 'meta';
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

const HUNK_PATTERN = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Turn a unified git patch into rows the viewer can draw. File headers are
 * omitted; hunk headers and binary/no-newline notices stay visible.
 */
export function parseGitPatch(patch: string): GitDiffPatchLine[] {
  const lines = patch.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const parsed: GitDiffPatchLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of lines) {
    if (raw.startsWith('diff --git ')) {
      inHunk = false;
      continue;
    }

    if (raw.startsWith('@@')) {
      const match = HUNK_PATTERN.exec(raw);
      if (!match) {
        parsed.push({ kind: 'meta', text: raw, oldLineNumber: null, newLineNumber: null });
        continue;
      }
      oldLine = Number(match[1]);
      newLine = Number(match[2]);
      inHunk = true;
      parsed.push({ kind: 'hunk', text: raw, oldLineNumber: null, newLineNumber: null });
      continue;
    }

    if (!inHunk) {
      if (raw.startsWith('Binary files ') || raw.startsWith('\\ No newline')) {
        parsed.push({ kind: 'meta', text: raw, oldLineNumber: null, newLineNumber: null });
      }
      continue;
    }

    if (raw.startsWith('\\ No newline')) {
      parsed.push({
        kind: 'meta',
        text: 'No newline at end of file',
        oldLineNumber: null,
        newLineNumber: null,
      });
      continue;
    }

    if (raw.startsWith('+')) {
      parsed.push({
        kind: 'add',
        text: raw.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      });
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

  return parsed;
}
