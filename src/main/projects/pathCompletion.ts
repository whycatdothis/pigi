import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import fuzzysort from 'fuzzysort';
import type { PathCompletionEntry, PathCompletionResult } from '../../shared/ipcContract';

const MAX_ENTRIES = 20;
/** Above this many names, cheaply drop non-subsequence candidates before scoring. */
const FUZZY_PREFILTER_THRESHOLD = 2000;
const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

interface PathPrefix {
  /** Absolute directory whose children are offered. */
  directory: string;
  /** Text after the last slash, matched against entry names. */
  namePrefix: string;
}

function expandHome(token: string): string {
  if (token === '~') return homedir();
  if (token.startsWith('~/')) return join(homedir(), token.slice(2));
  return token;
}

/** Split a typed path token into the directory to list and the name prefix. */
export function parsePathPrefix(cwd: string, token: string): PathPrefix {
  const expanded = expandHome(token);
  const lastSlash = expanded.lastIndexOf('/');
  const directoryText = lastSlash === -1 ? '' : expanded.slice(0, lastSlash + 1);
  return {
    directory: resolve(cwd, directoryText || '.'),
    namePrefix: expanded.slice(lastSlash + 1),
  };
}

function compareNames(left: PathCompletionEntry, right: PathCompletionEntry): number {
  return NAME_COLLATOR.compare(left.name, right.name);
}

/** Case-insensitive fuzzy prefilter; cheaper than scoring every long name. */
function isSubsequence(value: string, lowerCaseQuery: string): boolean {
  const haystack = value.toLowerCase();
  let position = 0;
  for (let index = 0; index < lowerCaseQuery.length; index += 1) {
    position = haystack.indexOf(lowerCaseQuery[index], position);
    if (position === -1) return false;
    position += 1;
  }
  return true;
}

/** Folders first when nothing is typed; otherwise rank folders and files together. */
function orderEntries(entries: PathCompletionEntry[], namePrefix: string): PathCompletionEntry[] {
  // Dotfiles stay hidden until the typed segment starts with a dot.
  const visible = namePrefix.startsWith('.')
    ? entries
    : entries.filter((entry) => !entry.name.startsWith('.'));
  const directories = visible.filter((entry) => entry.isDirectory);
  const files = visible.filter((entry) => !entry.isDirectory);

  if (namePrefix.length === 0) {
    return [...directories.sort(compareNames), ...files.sort(compareNames)].slice(0, MAX_ENTRIES);
  }

  const lowerCaseQuery = namePrefix.toLowerCase();
  const candidates =
    visible.length > FUZZY_PREFILTER_THRESHOLD
      ? visible.filter((entry) => isSubsequence(entry.name, lowerCaseQuery))
      : visible;
  const matches = fuzzysort
    .go(namePrefix, candidates, { key: 'name' })
    .map((result) => ({ entry: result.obj, score: result.score }));
  // Rank folders and files together. Concatenating the two lists used to let
  // a directory with 20 weak folder matches crowd every matching file out of
  // the result, so a file could not be completed at all.
  matches.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.entry.isDirectory !== right.entry.isDirectory) {
      return left.entry.isDirectory ? -1 : 1;
    }
    return compareNames(left.entry, right.entry);
  });
  return matches.slice(0, MAX_ENTRIES).map((match) => match.entry);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * List the filesystem entries that complete the path token being typed.
 * Unlike the project index, this must work outside the project (and see
 * ignored files), so it reads the directory directly rather than using fff.
 */
export async function completePath(cwd: string, token: string): Promise<PathCompletionResult> {
  const { directory, namePrefix } = parsePathPrefix(cwd, token);

  try {
    const dirents = await readdir(directory, { withFileTypes: true });
    const symlinkChecks: Promise<void>[] = [];
    const entries = dirents.map((dirent) => {
      const path = join(directory, dirent.name);
      const entry: PathCompletionEntry = {
        name: dirent.name,
        path,
        isDirectory: dirent.isDirectory(),
      };
      // `readdir` reports a symlink as a link, not as its target type.
      if (!entry.isDirectory && dirent.isSymbolicLink()) {
        symlinkChecks.push(
          stat(path)
            .then((stats) => {
              entry.isDirectory = stats.isDirectory();
            })
            .catch(() => {
              // Broken links and unreadable targets are listed as files.
            }),
        );
      }
      return entry;
    });
    await Promise.all(symlinkChecks);
    return { success: true, entries: orderEntries(entries, namePrefix) };
  } catch (error) {
    const code = errorCode(error);
    // A half-typed path often points at a directory that does not exist yet;
    // that is an empty completion, not a failure worth showing.
    if (code === 'ENOENT' || code === 'ENOTDIR') return { success: true, entries: [] };
    if (code === 'EACCES' || code === 'EPERM') {
      return { success: false, error: 'No permission to read this folder' };
    }
    return { success: false, error: 'Unable to read this folder' };
  }
}
