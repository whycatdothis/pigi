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
/** Past MAX_PARSED_FILES, parsing goes on only while nothing is found, for at most this long. */
const EXTRA_PARSE_BUDGET_MS = 3_000;
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
    // fff falls back to a literal search, which would find nothing, instead of failing.
    if (result.value.regexFallbackError) throw new Error(result.value.regexFallbackError);
    for (const item of result.value.items) {
      const path = item.relativePath.replaceAll('\\', '/');
      const language = codeLanguageForPath(path);
      if (language && languageFamily(language) === family) files.push(path);
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

/**
 * The file itself first, then `preferred` paths, then by how many directories
 * a path shares with the file, how deep it sits below them, and its length.
 */
export function rankByProximity(
  files: readonly string[],
  fromFile: string,
  preferred: (path: string) => boolean = () => false,
): string[] {
  const from = directorySegments(fromFile);
  const ranked = [...new Set([fromFile, ...files])].map((path) => {
    const segments = directorySegments(path);
    const shared = sharedPrefixLength(from, segments);
    const group = path === fromFile ? 0 : preferred(path) ? 1 : 2;
    return { path, key: [group, -shared, segments.length - shared, path.length] };
  });
  ranked.sort((a, b) => {
    const differing = a.key.findIndex((value, index) => value !== b.key[index]);
    return differing < 0
      ? a.path.localeCompare(b.path)
      : (a.key[differing] ?? 0) - (b.key[differing] ?? 0);
  });
  return ranked.map((entry) => entry.path);
}

/**
 * Perl keeps `package Foo::Bar` in `Foo/Bar.pm`; a lookup qualified by a
 * package, or of the package itself, tries that file before the nearest ones,
 * which may only mention the name.
 */
function perlPackageFile(identifier: Identifier): (path: string) => boolean {
  const suffix = `/${(identifier.scope ?? identifier.name).split('::').join('/')}.pm`;
  return (path) => `/${path}`.endsWith(suffix);
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
    language === 'perl' ? perlPackageFile(identifier) : undefined,
  );

  const started = Date.now();
  const found: { filePath: string; definition: Definition; lines: string[] }[] = [];
  for (const [index, file] of files.entries()) {
    const overBudget = found.length > 0 || Date.now() - started > EXTRA_PARSE_BUDGET_MS;
    if (index >= MAX_PARSED_FILES && overBudget) break;
    found.push(...(await definitionsInFile(cwd, file, identifier)));
  }

  // A qualified Perl call keeps only the subs of its package, when any match.
  const scoped = found.filter((entry) => entry.definition.scope === identifier.scope);
  const kept = identifier.scope && scoped.length > 0 ? scoped : found;
  const seen = new Set<string>();
  const definitions: CodeDefinition[] = [];
  for (const { filePath: path, definition, lines } of kept) {
    const key = `${path}:${definition.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    definitions.push({
      filePath: path,
      line: definition.line,
      lineContent: lineContentAt(lines, definition.line),
    });
  }
  return definitions;
}
