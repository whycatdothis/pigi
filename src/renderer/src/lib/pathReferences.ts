/** Path completion helpers, shared by the composer suggestion matcher and tests. */

/** Whitespace and `(` end a path token; the same boundary a shell would use. */
const PATH_TOKEN_BOUNDARY = /[\s(]/;

/** URLs contain slashes but are not paths. */
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export interface PathToken {
  /** The whole token, e.g. `src/renderer` or `~/Documents`. */
  token: string;
  /** Offset of the token start in the text that was searched. */
  startOffset: number;
}

/** Find a path-like token ending at the cursor. */
export function findPathTokenAtEnd(text: string): PathToken | null {
  let start = text.length;
  while (start > 0 && !PATH_TOKEN_BOUNDARY.test(text[start - 1])) start -= 1;

  const token = text.slice(start);
  if (!token.includes('/')) return null;
  // `//host` and `scheme://` look path-like but are not filesystem paths.
  if (token.startsWith('//') || URL_PATTERN.test(token)) return null;
  // @ file references and # project references have their own pickers.
  if (token.startsWith('@') || token.startsWith('#')) return null;

  return { token, startOffset: start };
}
