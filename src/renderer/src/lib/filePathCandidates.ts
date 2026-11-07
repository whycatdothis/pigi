/**
 * Text in chat that looks like a file path. Only a shape test: whether the file
 * exists is asked of the main process (`existingPaths.ts`), so a false positive
 * here costs a stat, never a wrong link.
 */
export interface FilePathCandidate {
  start: number;
  /** Exclusive end offset; covers a trailing `:12` / `#L12` so the link includes it. */
  end: number;
  /** The path without its line suffix. */
  path: string;
}

// ASCII only, so a path written straight into CJK prose (`修改了src/a.ts文件`)
// still comes out on its own.
const PROSE_TOKEN_PATTERN = /[\w@+.~/-]+(?::L?\d+(?:[-:]L?\d+)?|#L\d+(?:-L?\d+)?)?/g;
const LINE_SUFFIX_PATTERN = /(?::L?\d+(?:[-:]L?\d+)?|#L\d+(?:-L?\d+)?)$/;
// A letter first keeps version numbers (`v1.2.3`) out.
const EXTENSION_PATTERN = /\.[A-Za-z][A-Za-z0-9]*$/;

/** `src/a.ts:12` → `src/a.ts`. */
export function withoutLineSuffix(path: string): string {
  return path.replace(LINE_SUFFIX_PATTERN, '');
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

/** The path an inline code span holds, when the span is nothing but a path. */
export function filePathFromCode(code: string): string | null {
  const trimmed = code.trim();
  const path = withoutReferenceMark(withoutLineSuffix(trimmed));
  return isPathShaped(path) ? path : null;
}

export function findFilePathCandidates(text: string): FilePathCandidate[] {
  const candidates: FilePathCandidate[] = [];
  for (const match of text.matchAll(PROSE_TOKEN_PATTERN)) {
    const suffix = LINE_SUFFIX_PATTERN.exec(match[0])?.[0] ?? '';
    // Sentence punctuation is not part of the path: `see src/a.ts.`
    const body = match[0].slice(0, match[0].length - suffix.length);
    const token = body.replace(/[.-]+$/, '');
    const path = withoutReferenceMark(token);
    // A bare name in prose is more often `Node.js` or `e.g` than a file; code
    // spans are where a reply names one.
    if (!isPathShaped(path, true)) continue;
    const start = match.index ?? 0;
    const length = token.length === body.length ? match[0].length : token.length;
    candidates.push({ start, end: start + length, path });
  }
  return candidates;
}

const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/** The path a markdown link in chat points at, when it is not a URL or an anchor. */
export function filePathFromHref(href: string): string | null {
  if (href.startsWith('#') || href.startsWith('//') || URL_SCHEME_PATTERN.test(href)) return null;
  try {
    const path = decodeURIComponent(href.split(/[?#]/)[0]);
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}
