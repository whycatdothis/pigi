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
  let searchEnd = text.length;
  while (searchEnd > 0) {
    while (searchEnd > 0 && PATH_TOKEN_BOUNDARY.test(text[searchEnd - 1])) searchEnd -= 1;
    if (searchEnd === 0) return null;

    const wordEnd = searchEnd;
    let wordStart = wordEnd;
    while (wordStart > 0 && !PATH_TOKEN_BOUNDARY.test(text[wordStart - 1])) wordStart -= 1;

    const word = text.slice(wordStart, wordEnd);
    if (isPathStartWord(word)) {
      // A space after a bare path (or `~`) ends completion; later words are
      // prose, not a filename query. Once a name has been typed in this word,
      // spaces stay in the query so file names with spaces can be matched.
      if (wordEnd < text.length && !canContinueAfterPathWord(word)) return null;
      const token = text.slice(wordStart);
      // `//host` and `scheme://` look path-like but are not filesystem paths.
      if (token.startsWith('//') || URL_PATTERN.test(token)) return null;
      // @ file references and # project references have their own pickers.
      if (token.startsWith('@') || token.startsWith('#')) return null;
      return { token, startOffset: wordStart };
    }

    searchEnd = wordStart;
  }

  return null;
}

/** A word starts a path when it is `~` or contains a slash. */
function isPathStartWord(word: string): boolean {
  return word === '~' || word.includes('/');
}

/**
 * Whether a typed path word can absorb following spaces as part of a fuzzy
 * query. `~/Doc` and `src/My` can; a bare `~` or `src/` cannot.
 */
function canContinueAfterPathWord(word: string): boolean {
  if (word === '~') return false;
  const lastSlash = word.lastIndexOf('/');
  if (lastSlash === -1) return false;
  return word.slice(lastSlash + 1).trim().length > 0;
}

/** A leading `/name` token is a slash command only when it has no second slash. */
export function isLeadingSlashCommand(token: string): boolean {
  return token.startsWith('/') && !token.slice(1).includes('/');
}

/** Directory part of a completion token: `src/renderer/file` -> `src/renderer/`. */
export function pathTokenDirectory(token: string): string {
  return token.slice(0, token.lastIndexOf('/') + 1);
}

/**
 * Label for a completed path. Keep the prefix the user typed so a chip shows
 * `src/renderer`, not just `renderer`, and a directory chip can accumulate
 * further segments under that same full path.
 */
export function pathCompletionLabel(
  token: string,
  baseLabel: string | null,
  entryName: string,
): string {
  if (baseLabel) return joinPathLabel(baseLabel, entryName);
  // A bare tilde completes to the home directory itself; keep the alias the
  // user typed instead of replacing it with the account name.
  if (token === '~') return '~';
  return `${pathTokenDirectory(token)}${entryName}`;
}

function joinPathLabel(baseLabel: string, entryName: string): string {
  if (baseLabel === '/') return `/${entryName}`;
  return `${baseLabel.replace(/\/+$/, '')}/${entryName}`;
}
