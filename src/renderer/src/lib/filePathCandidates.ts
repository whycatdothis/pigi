export interface LineRange {
  start: number;
  /** Inclusive; equal to `start` for a single line. */
  end: number;
}

export interface FileLocation {
  /** The path without its line suffix. */
  path: string;
  lines: LineRange | null;
}

/**
 * Text in chat that looks like a file path. Only a shape test: whether the file
 * exists is asked of the main process (`existingPaths.ts`), so a false positive
 * here costs a stat, never a wrong link.
 */
export interface FilePathCandidate extends FileLocation {
  start: number;
  /** Exclusive end offset; covers a trailing `:12` / `#L12` so the link includes it. */
  end: number;
}

// `:12`, `:12-20`, `:L12-L20`, `:12:5` (the column is dropped), `#L12-L20`.
const LINE_SUFFIX = String.raw`(?::L?(\d+)(?:([-:])L?(\d+))?|#L(\d+)(?:-L?(\d+))?)`;
const TRAILING_LINE_SUFFIX_PATTERN = new RegExp(`${LINE_SUFFIX}$`);
const LEADING_LINE_SUFFIX_PATTERN = new RegExp(`^${LINE_SUFFIX}(?![\\w-])`);
// ASCII only, so a path written straight into CJK prose (`修改了src/a.ts文件`)
// still comes out on its own.
const PROSE_TOKEN_PATTERN = new RegExp(String.raw`[\w@+.~/-]+${LINE_SUFFIX}?`, 'g');
// A letter first keeps version numbers (`v1.2.3`) out.
const EXTENSION_PATTERN = /\.[A-Za-z][A-Za-z0-9]*$/;

function lineRange(match: RegExpExecArray): LineRange | null {
  const start = Number(match[1] ?? match[4]);
  const rangeEnd = match[2] === '-' ? match[3] : match[5];
  const end = rangeEnd === undefined ? start : Number(rangeEnd);
  if (start < 1 || end < 1) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/** `src/a.ts:12-20` → `src/a.ts`, lines 12–20. */
export function splitLineSuffix(text: string): FileLocation {
  const match = TRAILING_LINE_SUFFIX_PATTERN.exec(text);
  if (!match) return { path: text, lines: null };
  return { path: text.slice(0, match.index), lines: lineRange(match) };
}

/** The line suffix `text` starts with, as text after a reference that already ended: `:12-20 and…`. */
export function leadingLineSuffix(
  text: string,
): { length: number; lines: LineRange | null } | null {
  const match = LEADING_LINE_SUFFIX_PATTERN.exec(text);
  return match ? { length: match[0].length, lines: lineRange(match) } : null;
}

/** How a quote and a chip write a line range: `:12` or `:12-20`. */
export function formatLineSuffix(lines: LineRange): string {
  return lines.start === lines.end ? `:${lines.start}` : `:${lines.start}-${lines.end}`;
}

function isPathShaped(path: string, requireSlash = false): boolean {
  if (path.length === 0 || /\s/.test(path)) return false;
  if (path.startsWith('//') || path.includes('://') || path.endsWith('/')) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (name === '' || name === '.' || name === '..' || name === '~') return false;
  if (path.includes('/')) return true;
  return !requireSlash && EXTENSION_PATTERN.test(name);
}

/** `@src/a.ts` is how a prompt names a file; the path is what follows the `@`. */
function withoutReferenceMark(path: string): string {
  return path.startsWith('@') && path.includes('/') ? path.slice(1) : path;
}

/** The file an inline code span names, when the span is nothing but a path. */
export function filePathFromCode(code: string): FileLocation | null {
  const location = splitLineSuffix(code.trim());
  const path = withoutReferenceMark(location.path);
  return isPathShaped(path) ? { path, lines: location.lines } : null;
}

export function findFilePathCandidates(text: string): FilePathCandidate[] {
  const candidates: FilePathCandidate[] = [];
  for (const match of text.matchAll(PROSE_TOKEN_PATTERN)) {
    const { path: body, lines } = splitLineSuffix(match[0]);
    // Sentence punctuation is not part of the path: `see src/a.ts.`
    const token = body.replace(/[.-]+$/, '');
    const path = withoutReferenceMark(token);
    // A bare name in prose is more often `Node.js` or `e.g` than a file; code
    // spans are where a reply names one.
    if (!isPathShaped(path, true)) continue;
    const start = match.index;
    candidates.push(
      token.length === body.length
        ? { start, end: start + match[0].length, path, lines }
        : { start, end: start + token.length, path, lines: null },
    );
  }
  return candidates;
}

const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/** The file a markdown link in chat points at, when it is not a URL or an anchor. */
export function filePathFromHref(href: string): FileLocation | null {
  if (href.startsWith('#') || href.startsWith('//') || URL_SCHEME_PATTERN.test(href)) return null;
  const { path: target, lines } = splitLineSuffix(href);
  try {
    const path = decodeURIComponent(target.split(/[?#]/)[0]);
    return path.length > 0 ? { path, lines } : null;
  } catch {
    return null;
  }
}
