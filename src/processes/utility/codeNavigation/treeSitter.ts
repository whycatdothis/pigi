import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Language, Parser, Query, type Node, type Range, type Tree } from 'web-tree-sitter';
import { TREE_SITTER_DIRECTORY_ENV, type CodeLanguage } from '../../../shared/codeNavigation';
import { GRAMMARS, VUE_GRAMMAR, type ScriptLanguage } from './languages';

const DEFINITION_CAPTURE_PREFIX = 'definition.';
const NAME_CAPTURE = 'name';
const PERL_SEPARATOR = '::';

export interface ParsedSource {
  tree: Tree;
  /** The grammar the tree and its queries belong to. */
  language: ScriptLanguage;
}

export interface Definition {
  name: string;
  kind: string;
  /** 1-based. */
  line: number;
  /** Perl only: the package a sub belongs to. */
  scope: string | null;
}

/** What a click names: the symbol to look for, and a Perl qualifier such as `Foo::Bar`. */
export interface Identifier {
  name: string;
  scope: string | null;
}

let parser: Promise<Parser> | null = null;
const languages = new Map<string, Promise<Language>>();
const queries = new Map<ScriptLanguage, Promise<Query>>();

function grammarDirectory(): string {
  const directory = process.env[TREE_SITTER_DIRECTORY_ENV];
  if (!directory) throw new Error(`${TREE_SITTER_DIRECTORY_ENV} is not set`);
  return directory;
}

function getParser(): Promise<Parser> {
  parser ??= Parser.init().then(() => new Parser());
  return parser;
}

function loadLanguage(grammar: string): Promise<Language> {
  let language = languages.get(grammar);
  if (!language) {
    language = getParser().then(() =>
      Language.load(readFileSync(join(grammarDirectory(), grammar))),
    );
    languages.set(grammar, language);
  }
  return language;
}

function loadQuery(language: ScriptLanguage): Promise<Query> {
  let query = queries.get(language);
  if (!query) {
    const config = GRAMMARS[language];
    query = loadLanguage(config.grammar).then((loaded) => {
      const source = config.queries
        .map((file) => readFileSync(join(grammarDirectory(), 'queries', file), 'utf8'))
        .join('\n');
      return new Query(loaded, source);
    });
    queries.set(language, query);
  }
  return query;
}

async function parseWith(
  grammar: string,
  text: string,
  includedRanges?: Range[],
): Promise<Tree | null> {
  const [instance, language] = await Promise.all([getParser(), loadLanguage(grammar)]);
  instance.setLanguage(language);
  return instance.parse(text, null, includedRanges ? { includedRanges } : undefined);
}

function vueScriptLanguage(script: Node): ScriptLanguage {
  const attributes = script.firstNamedChild?.namedChildren ?? [];
  for (const attribute of attributes) {
    if (attribute?.type !== 'attribute' || attribute.firstNamedChild?.text !== 'lang') continue;
    const value = attribute.descendantsOfType('attribute_value')[0]?.text;
    if (value === 'ts') return 'typescript';
    if (value === 'tsx') return 'tsx';
  }
  return 'javascript';
}

/** A `.vue` file's `<script>` blocks, parsed in place with the grammar their `lang` names. */
async function parseVue(text: string): Promise<ParsedSource | null> {
  const document = await parseWith(VUE_GRAMMAR, text);
  if (!document) return null;
  try {
    const scripts = document.rootNode.namedChildren.filter(
      (node) => node?.type === 'script_element',
    );
    const ranges: Range[] = [];
    let language: ScriptLanguage = 'javascript';
    for (const script of scripts) {
      if (!script) continue;
      const content = script.namedChildren.find((node) => node?.type === 'raw_text');
      if (!content) continue;
      ranges.push({
        startIndex: content.startIndex,
        endIndex: content.endIndex,
        startPosition: content.startPosition,
        endPosition: content.endPosition,
      });
      const scriptLanguage = vueScriptLanguage(script);
      if (scriptLanguage !== 'javascript') language = scriptLanguage;
    }
    if (ranges.length === 0) return null;
    const tree = await parseWith(GRAMMARS[language].grammar, text, ranges);
    return tree ? { tree, language } : null;
  } finally {
    document.delete();
  }
}

/** The caller deletes the returned tree. */
export async function parseSource(
  language: CodeLanguage,
  text: string,
): Promise<ParsedSource | null> {
  if (language === 'vue') return parseVue(text);
  const tree = await parseWith(GRAMMARS[language].grammar, text);
  return tree ? { tree, language } : null;
}

function splitPerlName(text: string): Identifier {
  const separator = text.lastIndexOf(PERL_SEPARATOR);
  if (separator < 0) return { name: text, scope: null };
  return {
    name: text.slice(separator + PERL_SEPARATOR.length),
    scope: text.slice(0, separator),
  };
}

/**
 * The identifier at a position. A caret offset can sit just past the last
 * character of a word, so the character before it counts too.
 */
export function identifierAt(
  source: ParsedSource,
  line: number,
  column: number,
): Identifier | null {
  const { identifierTypes } = GRAMMARS[source.language];
  for (const candidate of [column, column - 1]) {
    if (candidate < 0) continue;
    const node = source.tree.rootNode.descendantForPosition({ row: line - 1, column: candidate });
    if (!node || !identifierTypes.has(node.type)) continue;
    if (source.language !== 'perl') return { name: node.text, scope: null };
    // A package name (`use Foo::Bar`, `Foo::Bar->new`) is looked up whole.
    const isPackage =
      node.type === 'package' ||
      (node.type === 'bareword' && node.parent?.type === 'method_call_expression');
    return isPackage ? { name: node.text, scope: null } : splitPerlName(node.text);
  }
  return null;
}

export async function definitionsIn(source: ParsedSource): Promise<Definition[]> {
  const query = await loadQuery(source.language);
  const definitions: Definition[] = [];
  for (const match of query.matches(source.tree.rootNode)) {
    const name = match.captures.find((capture) => capture.name === NAME_CAPTURE)?.node;
    const definition = match.captures.find((capture) =>
      capture.name.startsWith(DEFINITION_CAPTURE_PREFIX),
    );
    if (!name || !definition) continue;
    definitions.push({
      name: name.text,
      kind: definition.name.slice(DEFINITION_CAPTURE_PREFIX.length),
      line: name.startPosition.row + 1,
      scope: null,
    });
  }
  return source.language === 'perl' ? withPerlPackages(definitions) : definitions;
}

/**
 * A Perl sub belongs to the last `package` above it, unless its own name is
 * qualified (`sub Foo::bar`). Packages keep their full name.
 */
function withPerlPackages(definitions: Definition[]): Definition[] {
  const packages = definitions
    .filter((definition) => definition.kind === 'module')
    .sort((a, b) => a.line - b.line);
  return definitions.map((definition) => {
    if (definition.kind === 'module') return definition;
    const qualified = splitPerlName(definition.name);
    if (qualified.scope) return { ...definition, ...qualified };
    const owner = packages.findLast((candidate) => candidate.line <= definition.line);
    return { ...definition, scope: owner?.name ?? null };
  });
}
