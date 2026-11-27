#!/usr/bin/env node
/**
 * Layering, as a check rather than a convention.
 *
 * The renderer is the untrusted side: it may only reach the operating system
 * through the preload bridge, so it must not see `electron` or the main process
 * at all. `src/shared` is compiled into both sides, so it cannot touch either
 * platform. The preload sees `electron` and the shared contract, nothing else.
 *
 * These rules lived in AGENTS.md and in memory; an import that crosses a layer
 * compiles, runs, and quietly makes the sandbox a suggestion.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SOURCE_ROOT = 'src';
const LAYERS = [
  { prefix: 'src/renderer/', name: 'renderer' },
  { prefix: 'src/main/', name: 'main' },
  { prefix: 'src/preload/', name: 'preload' },
  { prefix: 'src/processes/', name: 'processes' },
  { prefix: 'src/shared/', name: 'shared' },
  { prefix: 'src/cli/', name: 'cli' },
];

/** Node builtins, bare or `node:`-prefixed; `fs/promises` counts as `fs`. */
const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'tls',
  'url',
  'util',
  'worker_threads',
  'zlib',
]);

function isBuiltin(specifier) {
  return specifier.startsWith('node:') || NODE_BUILTINS.has(specifier.split('/')[0]);
}

const RULES = [
  {
    layer: 'renderer',
    builtins: true,
    packages: ['electron'],
    forbid: ['src/main/', 'src/preload/', 'src/processes/', 'src/cli/'],
    why: 'the renderer is sandboxed: it reaches the system only through the preload bridge',
  },
  {
    layer: 'shared',
    builtins: true,
    packages: ['electron'],
    forbid: ['src/main/', 'src/renderer/', 'src/preload/', 'src/processes/', 'src/cli/'],
    why: 'shared code is compiled into both processes and must stay platform-free',
  },
  {
    layer: 'preload',
    builtins: true,
    forbid: ['src/renderer/', 'src/main/', 'src/processes/', 'src/cli/'],
    why: 'the preload exposes the shared contract, not either side of it',
  },
  {
    layer: 'main',
    forbid: ['src/renderer/'],
    why: 'the main process serves the renderer over IPC and never imports it',
  },
  {
    layer: 'processes',
    forbid: ['src/renderer/', 'src/main/'],
    why: 'a utility process runs the SDK and answers its own port, not the window',
  },
  {
    layer: 'cli',
    forbid: ['src/renderer/', 'src/preload/'],
    why: 'the CLI talks to the running app over its socket, not to either side of it',
  },
];

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

/**
 * Every specifier the file imports: `import`/`export ... from`, a bare `import`,
 * and the dynamic forms. The dynamic ones are the way around a layering rule
 * that only reads static syntax, and the repository forbids them anyway.
 */
function imports(source) {
  const specifiers = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\b[^'"()]*?from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function layerOf(path) {
  const normalized = path.split(sep).join('/');
  return LAYERS.find((layer) => normalized.startsWith(layer.prefix))?.name ?? null;
}

const violations = [];
for (const file of sourceFiles(SOURCE_ROOT)) {
  const layer = layerOf(relative(process.cwd(), file));
  const rule = RULES.find((candidate) => candidate.layer === layer);
  if (!rule) continue;
  for (const specifier of imports(readFileSync(file, 'utf8'))) {
    const packageName = specifier.startsWith('node:')
      ? specifier
      : specifier.split('/')[0] === '@'
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
    const target = specifier.startsWith('.')
      ? relative(process.cwd(), resolve(file, '..', specifier))
          .split(sep)
          .join('/')
      : null;
    const badPackage =
      (rule.packages?.includes(packageName) ?? false) ||
      (rule.builtins === true && isBuiltin(specifier));
    const badPath =
      target !== null && (rule.forbid ?? []).some((prefix) => target.startsWith(prefix));
    if (badPackage || badPath) {
      violations.push({ file: relative(process.cwd(), file), specifier, why: rule.why });
    }
  }
}

if (violations.length > 0) {
  for (const { file, specifier, why } of violations) {
    console.error(`${file}: imports "${specifier}" — ${why}`);
  }
  console.error(`\n${violations.length} cross-layer import(s).`);
  process.exit(1);
}
console.log(`Layering ok: ${sourceFiles(SOURCE_ROOT).length} files, no cross-layer imports.`);
