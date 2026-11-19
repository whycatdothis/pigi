import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Language, Parser, Query, type Node, type Range, type Tree } from 'web-tree-sitter';
import { TREE_SITTER_DIRECTORY_ENV, type CodeLanguage } from '../../../shared/codeNavigation';
import { GRAMMARS, VUE_GRAMMAR, type ScriptLanguage } from './languages';

const DEFINITION_CAPTURE_PREFIX = 'definition.';
const NAME_CAPTURE = 'name';
/** The capture kind `perl.scm` gives `package` statements. */
const PERL_PACKAGE_KIND = 'module';
const PERL_SEPARATOR = '::';
/** Where a Perl bareword names a package: `Foo::Bar->new`, `require Foo::Bar`. */
const PERL_PACKAGE_PARENTS = new Set(['method_call_expression', 'require_expression']);

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
  /** Where the identifier starts, 0-based, for the language server. */
  start: { line: number; character: number };
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

function splitPerlName(text: string): { name: string; scope: string | null } {
  const separator = text.lastIndexOf(PERL_SEPARATOR);
  if (separator < 0) return { name: text, scope: null };
  return {
    name: text.slice(separator + PERL_SEPARATOR.length),
    scope: text.slice(0, separator),
  };
}

/**
 * A package name is looked up whole; a sub name splits off its qualifier.
 * `&foo` and `\&foo` put the name in a `varname` under a `function`.
 */
function perlName(node: Node): { name: string; scope: string | null } | null {
  if (node.type === 'varname') {
    return node.parent?.type === 'function' ? splitPerlName(node.text) : null;
  }
  // `Foo::Bar::->new` is the same package as `Foo::Bar->new`.
  const text = node.text.endsWith(PERL_SEPARATOR)
    ? node.text.slice(0, -PERL_SEPARATOR.length)
    : node.text;
  const isPackage =
    node.type === 'package' ||
    (node.type === 'bareword' && PERL_PACKAGE_PARENTS.has(node.parent?.type ?? ''));
  return isPackage ? { name: text, scope: null } : splitPerlName(text);
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
    const named = source.language === 'perl' ? perlName(node) : { name: node.text, scope: null };
    if (!named) continue;
    const start = { line: node.startPosition.row, character: node.startPosition.column };
    return { ...named, start };
  }
  return null;
}

export async function definitionsIn(source: ParsedSource): Promise<Definition[]> {
  const query = await loadQuery(source.language);
  const found: { name: Node; definition: Node; kind: string }[] = [];
  for (const match of query.matches(source.tree.rootNode)) {
    const name = match.captures.find((capture) => capture.name === NAME_CAPTURE)?.node;
    const definition = match.captures.find((capture) =>
      capture.name.startsWith(DEFINITION_CAPTURE_PREFIX),
    );
    if (!name || !definition) continue;
    found.push({
      name,
      definition: definition.node,
      kind: definition.name.slice(DEFINITION_CAPTURE_PREFIX.length),
    });
  }
  const scopeOf = source.language === 'perl' ? perlScopes(found) : () => null;
  return found.map(({ name, kind }) => {
    const definition = { name: name.text, kind, line: name.startPosition.row + 1, scope: null };
    if (kind === PERL_PACKAGE_KIND || source.language !== 'perl') return definition;
    const qualified = splitPerlName(name.text);
    return qualified.scope
      ? { ...definition, ...qualified }
      : { ...definition, scope: scopeOf(name) };
  });
}

function hasBlock(node: Node): boolean {
  return node.namedChildren.some((child) => child?.type === 'block');
}

/**
 * The package a Perl sub belongs to: the `package Foo { … }` around it, else
 * the last `package Foo;` above it.
 */
function perlScopes(
  found: readonly { name: Node; definition: Node; kind: string }[],
): (name: Node) => string | null {
  const statements = found
    .filter((entry) => entry.kind === PERL_PACKAGE_KIND && !hasBlock(entry.definition))
    .map((entry) => entry.name);
  return (name) => {
    for (let ancestor = name.parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor.type === 'package_statement' && hasBlock(ancestor)) {
        return ancestor.childForFieldName('name')?.text ?? null;
      }
    }
    return statements.findLast((statement) => statement.startIndex < name.startIndex)?.text ?? null;
  };
}
