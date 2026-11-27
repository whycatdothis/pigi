import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TREE_SITTER_DIRECTORY_ENV, type CodeLanguage } from '../../../shared/codeNavigation';
import { definitionsIn, identifierAt, parseSource, type Identifier } from './treeSitter';

beforeAll(() => {
  process.env[TREE_SITTER_DIRECTORY_ENV] = resolve('resources/treeSitter');
});

async function definitionNames(language: CodeLanguage, source: string): Promise<string[]> {
  const parsed = await parseSource(language, source);
  if (!parsed) throw new Error('no tree');
  try {
    return [...new Set((await definitionsIn(parsed)).map((definition) => definition.name))].sort();
  } finally {
    parsed.tree.delete();
  }
}

/** The identifier under the first `|` in `source`, which is removed before parsing. */
async function identifierAtMarker(
  language: CodeLanguage,
  source: string,
): Promise<Identifier | null> {
  const offset = source.indexOf('|');
  const text = source.slice(0, offset) + source.slice(offset + 1);
  const before = text.slice(0, offset).split('\n');
  const parsed = await parseSource(language, text);
  if (!parsed) throw new Error('no tree');
  try {
    return identifierAt(parsed, before.length, before[before.length - 1]?.length ?? 0);
  } finally {
    parsed.tree.delete();
  }
}

// Each grammar upgrade must keep these: a renamed node fails query compilation,
// but a new wrapper node silently stops a parent-anchored pattern matching.
describe('definitions per language', () => {
  it('typescript', async () => {
    const source = `
export function run() {}
export const LIMIT = 3;
const handler = () => {};
export const Card = memo(() => null);
let local = 1;
function outer() { const inner = 2; }
class Store { count = 0; save() {} }
abstract class Base { abstract load(): void; }
interface Props { title: string }
type Id = string;
enum Color { Red }
namespace Api {}
declare function external(): void;
`;
    expect(await definitionNames('typescript', source)).toEqual([
      'Api',
      'Base',
      'Card',
      'Color',
      'Id',
      'LIMIT',
      'Props',
      'Store',
      'count',
      'external',
      'handler',
      'load',
      'local',
      'outer',
      'run',
      'save',
      'title',
    ]);
  });

  it('tsx', async () => {
    const source = `export const Button = forwardRef(() => <button />);\nfunction App() { return <Button />; }`;
    expect(await definitionNames('tsx', source)).toEqual(['App', 'Button']);
  });

  it('javascript', async () => {
    const source = `
module.exports.run = function () {};
const config = { load: () => 1 };
class Store { count = 0; #secret = 1; static create() {} }
function* ids() {}
`;
    expect(await definitionNames('javascript', source)).toEqual([
      '#secret',
      'Store',
      'config',
      'count',
      'create',
      'ids',
      'load',
      'run',
    ]);
  });

  it('python', async () => {
    const source = `
LIMIT = 3

@decorator
def run():
    local = 1

class Store:
    def save(self):
        pass
`;
    expect(await definitionNames('python', source)).toEqual(['LIMIT', 'Store', 'run', 'save']);
  });

  it('go', async () => {
    const source = `package store

var Default = 1
var (
\tgrouped = 2
)
const (
\tLimit = 3
)
type Store struct { Count int }
type Saver interface { Save() error }
type ID = string
func New() *Store { local := 1; return nil }
func (s *Store) Save() error { return nil }
`;
    expect(await definitionNames('go', source)).toEqual([
      'Count',
      'Default',
      'ID',
      'Limit',
      'New',
      'Save',
      'Saver',
      'Store',
      'grouped',
    ]);
  });

  it('rust', async () => {
    const source = `
const LIMIT: u32 = 3;
static NAME: &str = "x";
struct Store { count: u32 }
enum Color { Red }
trait Save { fn save(&self); }
impl Store { fn new() -> Self { todo!() } }
mod api {}
macro_rules! log { () => {} }
type Id = u64;
`;
    expect(await definitionNames('rust', source)).toEqual([
      'Color',
      'Id',
      'LIMIT',
      'NAME',
      'Red',
      'Save',
      'Store',
      'api',
      'count',
      'log',
      'new',
      'save',
    ]);
  });

  it('java', async () => {
    const source = `
class Store {
  private int count;
  void save() {}
}
interface Saver { int MAX = 1; }
enum Color { RED }
record Point(int x) {}
@interface Marker {}
`;
    expect(await definitionNames('java', source)).toEqual([
      'Color',
      'MAX',
      'Marker',
      'Point',
      'RED',
      'Saver',
      'Store',
      'count',
      'save',
    ]);
  });

  it('perl', async () => {
    const source = `
package Foo::Bar;
use constant LIMIT => 3;
use constant { RED => 1, BLUE => 2 };
has name => (is => 'ro');
has 'label' => (is => 'ro');
sub value_type { }
sub Other::helper { }
`;
    expect(await definitionNames('perl', source)).toEqual([
      'BLUE',
      'Foo::Bar',
      'LIMIT',
      'RED',
      'helper',
      'label',
      'name',
      'value_type',
    ]);
  });

  it('perl subs belong to the package above them', async () => {
    const parsed = await parseSource(
      'perl',
      'package A;\nsub one {}\npackage B;\nsub two {}\nsub C::three {}\npackage D {\n sub four {}\n}\nsub five {}\n',
    );
    if (!parsed) throw new Error('no tree');
    const scopes = (await definitionsIn(parsed))
      .filter((definition) => definition.kind !== 'module')
      .map((definition) => `${definition.scope}::${definition.name}`);
    parsed.tree.delete();
    expect(scopes.sort()).toEqual(['A::one', 'B::five', 'B::two', 'C::three', 'D::four']);
  });

  it('vue script blocks', async () => {
    const source = `<template><div>{{ total }}</div></template>
<script setup lang="ts">
const total = 1
type Row = { id: string }
</script>`;
    expect(await definitionNames('vue', source)).toEqual(['Row', 'id', 'total']);
  });
});

describe('identifierAt', () => {
  it('names the identifier under the position', async () => {
    expect(await identifierAtMarker('typescript', 'const a = sa|ve();')).toMatchObject({
      name: 'save',
      scope: null,
    });
  });

  it('takes the word a caret just past its end belongs to', async () => {
    expect(await identifierAtMarker('typescript', 'save|();')).toMatchObject({
      name: 'save',
      scope: null,
    });
  });

  it('counts columns in UTF-16 code units', async () => {
    expect(await identifierAtMarker('javascript', 'const s = "中文😀"; f|oo();')).toMatchObject({
      name: 'foo',
      scope: null,
    });
  });

  it('ignores keywords, strings and comments', async () => {
    expect(await identifierAtMarker('typescript', 'con|st a = 1;')).toBeNull();
    expect(await identifierAtMarker('typescript', 'const a = "sa|ve";')).toBeNull();
    expect(await identifierAtMarker('typescript', '// sa|ve\n')).toBeNull();
  });

  it('accepts JSX tags and member names', async () => {
    expect(await identifierAtMarker('tsx', 'const x = <But|ton />;')).toMatchObject({
      name: 'Button',
      scope: null,
    });
    expect(await identifierAtMarker('typescript', 'store.sa|ve();')).toMatchObject({
      name: 'save',
      scope: null,
    });
  });

  it('splits a qualified Perl call and keeps package names whole', async () => {
    expect(await identifierAtMarker('perl', 'Foo::Bar::b|az();')).toMatchObject({
      name: 'baz',
      scope: 'Foo::Bar',
    });
    expect(await identifierAtMarker('perl', 'Foo::B|ar->new;')).toMatchObject({
      name: 'Foo::Bar',
      scope: null,
    });
    expect(await identifierAtMarker('perl', 'use Foo::B|ar;')).toMatchObject({
      name: 'Foo::Bar',
      scope: null,
    });
    expect(await identifierAtMarker('perl', '$self->me|th;')).toMatchObject({
      name: 'meth',
      scope: null,
    });
    expect(await identifierAtMarker('perl', 'value_t|ype($x);')).toMatchObject({
      name: 'value_type',
      scope: null,
    });
    expect(await identifierAtMarker('perl', 'my $h = { a => \\&han|dler };')).toMatchObject({
      name: 'handler',
      scope: null,
    });
    expect(await identifierAtMarker('perl', '&ba|r();')).toMatchObject({ name: 'bar' });
    expect(await identifierAtMarker('perl', 'require Foo::B|ar;')).toMatchObject({
      name: 'Foo::Bar',
      scope: null,
    });
    expect(await identifierAtMarker('perl', 'Foo::B|ar::->new;')).toMatchObject({
      name: 'Foo::Bar',
      scope: null,
    });
  });

  it('gives the language server where the identifier starts', async () => {
    expect(await identifierAtMarker('typescript', 'a;\nconst x = sa|ve();')).toMatchObject({
      start: { line: 1, character: 10 },
    });
  });

  it('accepts private class members', async () => {
    expect(await identifierAtMarker('typescript', 'this.#co|unt;')).toMatchObject({
      name: '#count',
    });
  });

  it('finds identifiers inside a Vue script, not the template', async () => {
    const vue = '<template>{{ to|tal }}</template>\n<script>\nconst total = 1\n</script>';
    expect(await identifierAtMarker('vue', vue)).toBeNull();
    expect(
      await identifierAtMarker(
        'vue',
        '<template></template>\n<script>\nconst to|tal = 1\n</script>',
      ),
    ).toMatchObject({ name: 'total', scope: null });
  });
});
