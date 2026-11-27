/** Languages go to definition understands; see docs/goToDefinition.md. */
export type CodeLanguage =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'vue'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'perl';

const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, CodeLanguage> = new Map([
  ['ts', 'typescript'],
  ['mts', 'typescript'],
  ['cts', 'typescript'],
  ['tsx', 'tsx'],
  ['js', 'javascript'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['jsx', 'javascript'],
  ['vue', 'vue'],
  ['py', 'python'],
  ['pyi', 'python'],
  ['go', 'go'],
  ['rs', 'rust'],
  ['java', 'java'],
  ['pm', 'perl'],
  ['pl', 'perl'],
  ['t', 'perl'],
]);

export function codeLanguageForPath(path: string): CodeLanguage | null {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return LANGUAGE_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) ?? null;
}

/** Environment the code navigation utility process reads its grammar directory from. */
export const TREE_SITTER_DIRECTORY_ENV = 'PIGI_TREE_SITTER_DIR';
/** Holds `typescript-language-server/` and `typescript-for-navigation/`: node_modules, or their packaged copy. */
export const TYPESCRIPT_SERVER_DIRECTORY_ENV = 'PIGI_TYPESCRIPT_SERVER_DIR';
