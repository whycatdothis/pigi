import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TREE_SITTER_DIRECTORY_ENV } from '../../../shared/codeNavigation';
import type { FindDefinitionResult } from '../../../shared/ipcContract';
import { findDefinition } from './findDefinition';
import { serverDefinitions, stopLanguageServers } from './languageServer';

let root: string;
const originalPath = process.env['PATH'];

async function writeFiles(base: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), content);
  }
}

/** `line` is 1-based, `column` 0-based, as the renderer sends them. */
async function lookup(
  cwd: string,
  filePath: string,
  line: number,
  column: number,
): Promise<FindDefinitionResult> {
  return findDefinition({ requestId: 1, cwd, filePath, line, column });
}

function located(result: FindDefinitionResult): string[] {
  if (!result.success) throw new Error(result.error);
  return result.definitions.map((definition) => `${definition.filePath}:${definition.line}`);
}

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
  stopLanguageServers();
  process.env['PATH'] = originalPath;
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

/**
 * A minimal language server: answers `initialize`, then behaves as the
 * `mode` file in its working directory says.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const { createProtocolConnection } = require(${JSON.stringify(
  resolve('node_modules/vscode-languageserver-protocol/lib/node/main.js'),
)});
const mode = readFileSync('mode', 'utf8').trim();
const connection = createProtocolConnection(process.stdin, process.stdout);
// A real server rejects a second didOpen of a document it already has open.
const open = new Set();
connection.onNotification('textDocument/didOpen', ({ textDocument }) => {
  if (open.has(textDocument.uri)) process.exit(2);
  open.add(textDocument.uri);
});
connection.onNotification('textDocument/didClose', ({ textDocument }) => open.delete(textDocument.uri));
connection.onRequest('initialize', () => {
  if (mode === 'crash') process.exit(1);
  return { capabilities: { definitionProvider: true } };
});
connection.onRequest('textDocument/definition', (params) => {
  if (mode === 'hang') return new Promise(() => {});
  if (mode === 'empty') return [];
  if (mode === 'link') {
    const range = { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } };
    return [{ targetUri: require('node:url').pathToFileURL(readFileSync('outside', 'utf8').trim()).href, targetRange: range, targetSelectionRange: range }];
  }
  return [{ uri: params.textDocument.uri, range: { start: { line: 0, character: 5 }, end: { line: 0, character: 8 } } }];
});
connection.onRequest('shutdown', () => null);
connection.onNotification('exit', () => process.exit(0));
connection.listen();
`;

describe('language server tier', () => {
  let bin: string;

  async function serverProject(mode: string): Promise<string> {
    const project = await mkdtemp(join(tmpdir(), `pigi-server-${mode}-`));
    await writeFiles(project, {
      mode,
      'main.go': 'package main\n\nfunc run() {}\n\nfunc main() { run() }\n',
    });
    return project;
  }

  beforeAll(async () => {
    bin = await mkdtemp(join(tmpdir(), 'pigi-fake-gopls-'));
    await writeFile(join(bin, 'gopls'), FAKE_SERVER);
    await chmod(join(bin, 'gopls'), 0o755);
    process.env['PATH'] = `${bin}:${originalPath}`;
  });

  afterAll(async () => {
    await rm(bin, { recursive: true, force: true });
  });

  it("uses the server's answer, lookup after lookup", async () => {
    const project = await serverProject('answer');
    // The fake points every lookup at line 1, where no tags query would.
    expect(located(await lookup(project, 'main.go', 5, 15))).toEqual(['main.go:1']);
    expect(located(await lookup(project, 'main.go', 5, 15))).toEqual(['main.go:1']);
  });

  it('opens a location link outside the project by its absolute path', async () => {
    const project = await serverProject('link');
    const outside = join(bin, 'stdlib.go');
    await writeFiles(project, { outside });
    await writeFile(outside, 'package lib\n\nfunc run() {}\n');
    const result = await lookup(project, 'main.go', 5, 15);
    expect(result.success && result.definitions).toEqual([
      { filePath: outside, line: 3, lineContent: 'func run() {}' },
    ]);
  });

  it('falls back to search when the server finds nothing', async () => {
    const project = await serverProject('empty');
    expect(located(await lookup(project, 'main.go', 5, 15))).toEqual(['main.go:3']);
  });

  it('falls back to search when the server crashes', async () => {
    const project = await serverProject('crash');
    expect(located(await lookup(project, 'main.go', 5, 15))).toEqual(['main.go:3']);
  });

  it('gives up on a server that does not answer within the budget', async () => {
    const project = await serverProject('hang');
    const started = Date.now();
    const answer = await serverDefinitions(
      project,
      join(project, 'main.go'),
      'go',
      'package main\n',
      { line: 4, character: 15 },
      200,
    );
    expect(answer).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
