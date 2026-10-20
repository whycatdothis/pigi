import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import fuzzysort from 'fuzzysort';
import type { PathCompletionEntry, PathCompletionResult } from '../../shared/ipcContract';

const MAX_ENTRIES = 20;

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
  return left.name.localeCompare(right.name);
}

/** Folders first, then fuzzy matches (or alphabetical when nothing is typed). */
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

  const rank = (list: PathCompletionEntry[]): PathCompletionEntry[] =>
    fuzzysort.go(namePrefix, list, { key: 'name' }).map((result) => result.obj);

  return [...rank(directories), ...rank(files)].slice(0, MAX_ENTRIES);
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
    const entries: PathCompletionEntry[] = dirents.map((dirent) => ({
      name: dirent.name,
      path: join(directory, dirent.name),
      isDirectory: dirent.isDirectory(),
    }));
    return { success: true, entries: orderEntries(entries, namePrefix) };
  } catch (error) {
    const code = errorCode(error);
    // A half-typed path often points at a directory that does not exist yet;
    // that is an empty completion, not a failure worth showing.
    if (code === 'ENOENT' || code === 'ENOTDIR') return { success: true, entries: [] };
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to list the directory',
    };
  }
}
