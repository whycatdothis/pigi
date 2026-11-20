import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TREE_SITTER_DIRECTORY_ENV,
  TYPESCRIPT_SERVER_DIRECTORY_ENV,
} from '../../../shared/codeNavigation';
import { serverDefinitions, stopLanguageServers } from './languageServer';
import { located, lookup, writeFiles } from './testProject';

const originalPath = process.env['PATH'];

beforeAll(() => {
  process.env[TREE_SITTER_DIRECTORY_ENV] = resolve('resources/treeSitter');
  process.env[TYPESCRIPT_SERVER_DIRECTORY_ENV] = resolve('node_modules');
});

afterAll(() => {
  stopLanguageServers();
  process.env['PATH'] = originalPath;
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

describe('installed language server', () => {
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

describe('bundled TypeScript server', () => {
  let project: string;
  const marker = (name: string): string => join(project, name);

  beforeAll(async () => {
    project = await mkdtemp(join(tmpdir(), 'pigi-typescript-'));
    const writeMarker = (name: string): string =>
      `require('node:fs').writeFileSync(${JSON.stringify(marker(name))}, '');`;
    await writeFiles(project, {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { plugins: [{ name: 'project-plugin' }] },
        include: ['src'],
      }),
      'node_modules/project-plugin/index.js': `${writeMarker('plugin-ran')}\nmodule.exports = () => ({ create: (info) => info.languageService });\n`,
      // The project's own TypeScript, which an installed server would run.
      'node_modules/typescript/package.json': JSON.stringify({
        name: 'typescript',
        version: '5.0.0',
      }),
      'node_modules/typescript/lib/tsserver.js': `${writeMarker('project-typescript-ran')}\n`,
      'src/local.ts': 'export function f(param: number) {\n  return param;\n}\n',
    });
  });

  afterAll(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it("finds a parameter, which only a server can, without running the project's code", async () => {
    const path = join(project, 'src', 'local.ts');
    // A cold start may take a while; the 3 s budget is not what this tests.
    const answer = await serverDefinitions(
      project,
      path,
      'typescript',
      await readFile(path, 'utf8'),
      { line: 1, character: 9 },
      30_000,
    );
    expect(answer).toEqual([{ path, line: 1 }]);
    expect(existsSync(marker('plugin-ran'))).toBe(false);
    expect(existsSync(marker('project-typescript-ran'))).toBe(false);
  });

  it('starts no server when the bundled TypeScript is missing', async () => {
    process.env[TYPESCRIPT_SERVER_DIRECTORY_ENV] = project;
    try {
      const path = join(project, 'src', 'local.ts');
      expect(
        await serverDefinitions(project, path, 'typescript', '', { line: 1, character: 9 }, 1_000),
      ).toBeNull();
      expect(existsSync(marker('project-typescript-ran'))).toBe(false);
    } finally {
      process.env[TYPESCRIPT_SERVER_DIRECTORY_ENV] = resolve('node_modules');
    }
  });
});
