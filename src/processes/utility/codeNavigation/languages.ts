import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CodeLanguage } from '../../../shared/codeNavigation';

export interface ServerCommand {
  command: string;
  args: readonly string[] | ((root: string) => string[]);
}

/** The language a `.vue` file's `<script>` is parsed with. */
export type ScriptLanguage = Exclude<CodeLanguage, 'vue'>;

interface GrammarConfig {
  /** File name under resources/treeSitter. */
  grammar: string;
  /** Files under resources/treeSitter/queries, concatenated. */
  queries: readonly string[];
  /** Node types a click may land on to name a symbol. */
  identifierTypes: ReadonlySet<string>;
}

const ECMASCRIPT_IDENTIFIERS = new Set([
  'identifier',
  'property_identifier',
  'type_identifier',
  'shorthand_property_identifier',
  'shorthand_property_identifier_pattern',
]);

export const GRAMMARS: Readonly<Record<ScriptLanguage, GrammarConfig>> = {
  typescript: {
    grammar: 'tree-sitter-typescript.wasm',
    queries: ['ecmascript.scm', 'typescript.scm'],
    identifierTypes: ECMASCRIPT_IDENTIFIERS,
  },
  tsx: {
    grammar: 'tree-sitter-tsx.wasm',
    queries: ['ecmascript.scm', 'typescript.scm'],
    identifierTypes: ECMASCRIPT_IDENTIFIERS,
  },
  javascript: {
    grammar: 'tree-sitter-javascript.wasm',
    queries: ['ecmascript.scm', 'javascript.scm'],
    identifierTypes: ECMASCRIPT_IDENTIFIERS,
  },
  python: {
    grammar: 'tree-sitter-python.wasm',
    queries: ['python.scm'],
    identifierTypes: new Set(['identifier']),
  },
  go: {
    grammar: 'tree-sitter-go.wasm',
    queries: ['go.scm'],
    identifierTypes: new Set([
      'identifier',
      'field_identifier',
      'type_identifier',
      'package_identifier',
    ]),
  },
  rust: {
    grammar: 'tree-sitter-rust.wasm',
    queries: ['rust.scm'],
    identifierTypes: new Set(['identifier', 'field_identifier', 'type_identifier']),
  },
  java: {
    grammar: 'tree-sitter-java.wasm',
    queries: ['java.scm'],
    identifierTypes: new Set(['identifier', 'type_identifier']),
  },
  perl: {
    grammar: 'tree-sitter-perl.wasm',
    queries: ['perl.scm'],
    identifierTypes: new Set(['function', 'method', 'bareword', 'package']),
  },
};

export const VUE_GRAMMAR = 'tree-sitter-vue.wasm';

/** Files that can define each other's symbols. */
export function languageFamily(language: CodeLanguage): string {
  switch (language) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
    case 'vue':
      return 'ecmascript';
    default:
      return language;
  }
}

interface LanguageServerConfig {
  /** LSP `languageId` of the opened document. */
  languageId: string;
  /** Tried in order; the first one installed wins. */
  servers: readonly ServerCommand[];
}

const TYPESCRIPT_SERVERS: readonly ServerCommand[] = [
  { command: 'typescript-language-server', args: ['--stdio'] },
  { command: 'vtsls', args: ['--stdio'] },
];

/**
 * Vue has none: its language server answers script positions only through a
 * paired TypeScript server plugin.
 */
export const LANGUAGE_SERVERS: Readonly<Partial<Record<CodeLanguage, LanguageServerConfig>>> = {
  typescript: { languageId: 'typescript', servers: TYPESCRIPT_SERVERS },
  tsx: { languageId: 'typescriptreact', servers: TYPESCRIPT_SERVERS },
  javascript: { languageId: 'javascript', servers: TYPESCRIPT_SERVERS },
  python: {
    languageId: 'python',
    servers: [
      { command: 'basedpyright-langserver', args: ['--stdio'] },
      { command: 'pyright-langserver', args: ['--stdio'] },
      { command: 'pylsp', args: [] },
      { command: 'jedi-language-server', args: [] },
    ],
  },
  go: { languageId: 'go', servers: [{ command: 'gopls', args: [] }] },
  rust: { languageId: 'rust', servers: [{ command: 'rust-analyzer', args: [] }] },
  java: {
    languageId: 'java',
    // jdtls keeps its per-project index in the -data directory it is given.
    servers: [{ command: 'jdtls', args: (root) => ['-data', jdtlsDataDirectory(root)] }],
  },
  perl: { languageId: 'perl', servers: [{ command: 'perlnavigator', args: ['--stdio'] }] },
};

function jdtlsDataDirectory(root: string): string {
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  return join(tmpdir(), 'pigi-jdtls', key);
}
