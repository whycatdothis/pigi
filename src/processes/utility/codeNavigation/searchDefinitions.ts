import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileFinder } from '@ff-labs/fff-node';
import { codeLanguageForPath, type CodeLanguage } from '../../../shared/codeNavigation';
import type { CodeDefinition } from '../../../shared/ipcContract';
import { languageFamily } from './languages';
import { definitionsIn, parseSource, type Definition, type Identifier } from './treeSitter';

/** Same as the `@`-search finders in main: one per project browsed, and at most two. */
const MAX_OPEN_FINDERS = 2;
const INITIAL_SCAN_WAIT_MS = 10_000;
const RECALL_PAGE_SIZE = 1000;
/** A common name (Perl `value_type`) recalls thousands of files; parsing is ~6 ms each. */
const MAX_PARSED_FILES = 200;
/** Generated bundles parse slowly and rarely hold the definition someone is after. */
const MAX_FILE_BYTES = 1_000_000;
const MAX_LINE_CONTENT_LENGTH = 200;

/** A definition's line as the candidate list shows it. */
export function lineContentAt(lines: readonly string[], line: number): string {
  return (lines[line - 1] ?? '').trim().slice(0, MAX_LINE_CONTENT_LENGTH);
}

/** Open finders by project path; Map insertion order doubles as LRU order. */
const finders = new Map<string, Promise<FileFinder>>();

async function createFinder(cwd: string): Promise<FileFinder> {
  const created = FileFinder.create({
    basePath: cwd,
    disableMmapCache: true,
    disableContentIndexing: true,
  });
  if (!created.ok) throw new Error(created.error);
  // A timed-out scan still leaves a usable partial index.
  await created.value.waitForScan(INITIAL_SCAN_WAIT_MS);
  return created.value;
}

function getFinder(cwd: string): Promise<FileFinder> {
  const existing = finders.get(cwd);
  if (existing) {
    finders.delete(cwd);
    finders.set(cwd, existing);
    return existing;
  }
  const created = createFinder(cwd);
  // A failed creation is retried on the next lookup.
  created.catch(() => finders.delete(cwd));
  finders.set(cwd, created);
  if (finders.size > MAX_OPEN_FINDERS) {
    const [oldestPath, oldest] = finders.entries().next().value ?? [];
    if (oldestPath !== undefined && oldest) {
      finders.delete(oldestPath);
      void oldest.then((finder) => finder.destroy()).catch(() => {});
    }
  }
  return created;
}

export function stopFinders(): void {
  for (const finder of finders.values())
    void finder.then((value) => value.destroy()).catch(() => {});
  finders.clear();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every file of the same language family that mentions the name as a whole
 * word. `\b` is not used: it never matches next to `$` (`$emit`, `foo$`).
 */
function recallFiles(finder: FileFinder, name: string, family: string): string[] {
  const pattern = `(?:^|[^\\w$])${escapeRegex(name)}(?:[^\\w$]|$)`;
  const files: string[] = [];
  let cursor = null;
  do {
    const result = finder.grep(pattern, {
      mode: 'regex',
      smartCase: false,
      maxMatchesPerFile: 1,
      maxFileSize: MAX_FILE_BYTES,
      pageSize: RECALL_PAGE_SIZE,
      cursor,
    });
    if (!result.ok) throw new Error(result.error);
    for (const item of result.value.items) {
      const language = codeLanguageForPath(item.relativePath);
      if (language && languageFamily(language) === family) files.push(item.relativePath);
    }
    cursor = result.value.nextCursor;
  } while (cursor);
  return files;
}

function directorySegments(path: string): string[] {
  return path.split('/').slice(0, -1);
}

function sharedPrefixLength(a: readonly string[], b: readonly string[]): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}

/** The file itself first, then by how many directories a path shares with it, then shorter paths. */
export function rankByProximity(files: readonly string[], fromFile: string): string[] {
  const from = directorySegments(fromFile);
  const score = (path: string): number =>
    path === fromFile ? Number.MAX_SAFE_INTEGER : sharedPrefixLength(from, directorySegments(path));
  return [...new Set([fromFile, ...files])].sort(
    (a, b) => score(b) - score(a) || a.length - b.length || a.localeCompare(b),
  );
}

/** A qualified Perl call keeps only the subs of its package, when any match. */
function inScope(definitions: Definition[], scope: string | null): Definition[] {
  if (!scope) return definitions;
  const scoped = definitions.filter((definition) => definition.scope === scope);
  return scoped.length > 0 ? scoped : definitions;
}

async function definitionsInFile(
  cwd: string,
  filePath: string,
  identifier: Identifier,
): Promise<{ filePath: string; definition: Definition; lines: string[] }[]> {
  const language = codeLanguageForPath(filePath);
  if (!language) return [];
  const text = await readFile(join(cwd, filePath), 'utf8').catch(() => null);
  if (text === null) return [];
  const parsed = await parseSource(language, text);
  if (!parsed) return [];
  try {
    const lines = text.split('\n');
    return (await definitionsIn(parsed))
      .filter((definition) => definition.name === identifier.name)
      .map((definition) => ({ filePath, definition, lines }));
  } finally {
    parsed.tree.delete();
  }
}

/** Search-based fallback: see docs/goToDefinition.md §3.2. */
export async function searchDefinitions(
  cwd: string,
  filePath: string,
  language: CodeLanguage,
  identifier: Identifier,
): Promise<CodeDefinition[]> {
  const finder = await getFinder(cwd);
  const files = rankByProximity(
    recallFiles(finder, identifier.name, languageFamily(language)),
    filePath,
  ).slice(0, MAX_PARSED_FILES);

  const found: { filePath: string; definition: Definition; lines: string[] }[] = [];
  for (const file of files) found.push(...(await definitionsInFile(cwd, file, identifier)));

  const kept = new Set(
    inScope(
      found.map((entry) => entry.definition),
      identifier.scope,
    ),
  );
  const seen = new Set<string>();
  const definitions: CodeDefinition[] = [];
  for (const entry of found) {
    const key = `${entry.filePath}:${entry.definition.line}`;
    if (!kept.has(entry.definition) || seen.has(key)) continue;
    seen.add(key);
    definitions.push({
      filePath: entry.filePath,
      line: entry.definition.line,
      lineContent: lineContentAt(entry.lines, entry.definition.line),
    });
  }
  return definitions;
}
