import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { codeLanguageForPath, type CodeLanguage } from '../../../shared/codeNavigation';
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
  language: CodeLanguage,
  line: number,
  column: number,
): Promise<Identifier | null> {
  const parsed = await parseSource(language, text);
  if (!parsed) return null;
  try {
    return identifierAt(parsed, line, column);
  } finally {
    parsed.tree.delete();
  }
}

/**
 * Project-relative inside the project, absolute outside it (standard library,
 * dependencies). Servers may answer with the real path of a symlinked project.
 */
function displayPath(roots: readonly string[], path: string): string {
  for (const root of roots) {
    const inside = relative(root, path);
    if (inside && !inside.startsWith('..') && !isAbsolute(inside)) {
      return inside.split(sep).join('/');
    }
  }
  return path;
}

async function describeLocations(
  cwd: string,
  locations: ServerLocation[],
): Promise<CodeDefinition[]> {
  const roots = [cwd, await realpath(cwd).catch(() => cwd)];
  return Promise.all(
    locations.map(async ({ path, line }) => {
      const text = await readFile(path, 'utf8').catch(() => '');
      return {
        filePath: displayPath(roots, path),
        line,
        lineContent: lineContentAt(text.split('\n'), line),
      };
    }),
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
    const identifier = await identifierInFile(text, language, line, column);
    if (!identifier) return { success: true, symbol: null, definitions: [] };

    const fromServer = await serverDefinitions(
      cwd,
      absolutePath,
      language,
      text,
      identifier.start,
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
