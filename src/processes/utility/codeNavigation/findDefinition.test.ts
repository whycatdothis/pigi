import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TREE_SITTER_DIRECTORY_ENV } from '../../../shared/codeNavigation';
import { located, lookup, writeFiles } from './testProject';

// The bundled TypeScript server would answer the .ts lookups; these test the search.
vi.mock('./languageServer', () => ({ serverDefinitions: async () => null }));

let root: string;

beforeAll(async () => {
  process.env[TREE_SITTER_DIRECTORY_ENV] = resolve('resources/treeSitter');
  root = await mkdtemp(join(tmpdir(), 'pigi-definition-'));
  await writeFiles(root, {
    '.gitignore': 'ignored/\n',
    'src/app.ts': "import { save } from './store';\nsave();\nconst $emit = 1;\n$emit;\n",
    'src/store.ts': 'export function save() {}\n',
    'src/feature/store.ts': 'export function save() {}\n',
    'other/store.ts': 'export function save() {}\n',
    'other/mention.ts': '// save is mentioned here but not defined\n',
    'ignored/store.ts': 'export function save() {}\n',
    'src/notes.py': 'def save():\n    pass\n',
    'lib/Foo/Bar.pm': 'package Foo::Bar;\nsub baz { }\n1;\n',
    'lib/Other.pm': 'package Other;\nsub baz { }\n1;\n',
    'script/run.pl': 'use Foo::Bar;\nFoo::Bar::baz();\nFoo::Bar->new;\n',
  });
  execFileSync('git', ['init', '-q'], { cwd: root });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('search-based fallback', () => {
  it('ranks nearer definitions first and skips .gitignore and other languages', async () => {
    const result = await lookup(root, 'src/app.ts', 2, 1);
    expect(result.success && result.symbol).toBe('save');
    expect(located(result)).toEqual([
      'src/store.ts:1',
      'src/feature/store.ts:1',
      'other/store.ts:1',
    ]);
  });

  it('finds names with $ in them', async () => {
    expect(located(await lookup(root, 'src/app.ts', 4, 2))).toEqual(['src/app.ts:3']);
  });

  it('returns no symbol off an identifier', async () => {
    const result = await lookup(root, 'src/app.ts', 1, 2);
    expect(result).toEqual({ success: true, symbol: null, definitions: [] });
  });

  it('keeps a qualified Perl call to its package, and finds packages', async () => {
    expect(located(await lookup(root, 'script/run.pl', 2, 11))).toEqual(['lib/Foo/Bar.pm:2']);
    expect(located(await lookup(root, 'script/run.pl', 3, 6))).toEqual(['lib/Foo/Bar.pm:1']);
  });
});

describe('search-based fallback past the parse cap', () => {
  let crowded: string;

  beforeAll(async () => {
    crowded = await mkdtemp(join(tmpdir(), 'pigi-definition-crowded-'));
    const files: Record<string, string> = {
      'lib/Foo/Bar.pm': 'package Foo::Bar;\nsub value_type { }\n1;\n',
      'zz/far/away/Defs.pm': 'package Defs;\nsub common_name { }\n1;\n',
      'app/views/main.pl': 'Foo::Bar::value_type();\ncommon_name();\n',
      // Found within the cap, so parsing stops before reaching lib/.
      'app/views/Decoy.pm': 'package Decoy;\nsub value_type { }\n1;\n',
    };
    // More files near the click than the cap, all only mentioning the names.
    for (let index = 0; index < 250; index += 1) {
      files[`app/views/view${index}.pl`] = 'value_type();\ncommon_name();\n';
    }
    await writeFiles(crowded, files);
    execFileSync('git', ['init', '-q'], { cwd: crowded });
  });

  afterAll(async () => {
    await rm(crowded, { recursive: true, force: true });
  });

  it("tries a Perl package's own file first", async () => {
    expect(located(await lookup(crowded, 'app/views/main.pl', 1, 11))).toEqual([
      'lib/Foo/Bar.pm:2',
    ]);
  });

  it('keeps parsing past the cap while nothing is found', async () => {
    expect(located(await lookup(crowded, 'app/views/main.pl', 2, 2))).toEqual([
      'zz/far/away/Defs.pm:2',
    ]);
  });
});
