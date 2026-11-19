import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { codeLanguageForPath } from '../../../shared/codeNavigation';
import type {
  CodeDefinition,
  CodeNavigationRequest,
  FindDefinitionResult,
} from '../../../shared/ipcContract';
import { serverDefinitions, type ServerLocation } from './languageServer';
import { lineContentAt, searchDefinitions } from './searchDefinitions';
import { identifierAt, parseSource, type Identifier } from './treeSitter';

/** Past this, the lookup uses the search-based fallback; the server keeps starting for the next one. */
const LANGUAGE_SERVER_BUDGET_MS = 3_000;

async function identifierInFile(
  text: string,
  filePath: string,
  line: number,
  column: number,
): Promise<Identifier | null> {
  const language = codeLanguageForPath(filePath);
  if (!language) return null;
  const parsed = await parseSource(language, text);
  if (!parsed) return null;
  try {
    return identifierAt(parsed, line, column);
  } finally {
    parsed.tree.delete();
  }
}

/** Project-relative inside the project, absolute outside it (standard library, dependencies). */
function displayPath(cwd: string, path: string): string {
  const inside = relative(cwd, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return path;
  return inside.split(sep).join('/');
}

async function describeLocations(
  cwd: string,
  locations: ServerLocation[],
): Promise<CodeDefinition[]> {
  const texts = new Map<string, Promise<string[]>>();
  const linesOf = (path: string): Promise<string[]> => {
    let lines = texts.get(path);
    if (!lines) {
      lines = readFile(path, 'utf8').then(
        (text) => text.split('\n'),
        () => [],
      );
      texts.set(path, lines);
    }
    return lines;
  };
  return Promise.all(
    locations.map(async ({ path, line }) => ({
      filePath: displayPath(cwd, path),
      line,
      lineContent: lineContentAt(await linesOf(path), line),
    })),
  );
}

/** See docs/goToDefinition.md §3: language server first, search-based fallback after. */
export async function findDefinition(
  request: CodeNavigationRequest,
): Promise<FindDefinitionResult> {
  const { cwd, filePath, line, column } = request;
  const language = codeLanguageForPath(filePath);
  if (!language || isAbsolute(filePath)) {
    return { success: true, symbol: null, definitions: [] };
  }
  try {
    const absolutePath = join(cwd, filePath);
    const text = await readFile(absolutePath, 'utf8');
    const identifier = await identifierInFile(text, filePath, line, column);
    if (!identifier) return { success: true, symbol: null, definitions: [] };

    const fromServer = await serverDefinitions(
      cwd,
      absolutePath,
      language,
      text,
      { line: line - 1, character: column },
      LANGUAGE_SERVER_BUDGET_MS,
    );
    const definitions = fromServer?.length
      ? await describeLocations(cwd, fromServer)
      : await searchDefinitions(cwd, filePath, language, identifier);
    return { success: true, symbol: identifier.name, definitions };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to find the definition',
    };
  }
}
