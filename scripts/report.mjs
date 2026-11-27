#!/usr/bin/env node
/**
 * The one table worth looking at weekly: what this repository measures about
 * itself, in one screen. Read the trend, not the number — a line that is always
 * green has stopped saying anything, and a line that is always red has stopped
 * being read.
 *
 * Nothing here builds, installs or reaches the network: it reads what the repo
 * already knows, so it stays a five-second command.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { measureBundle } from './checkBundleBudget.mjs';

const MAX_LINES = 800;

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(tsx?|mjs)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function lines(path) {
  return readFileSync(path, 'utf8').split('\n').length - 1;
}

const files = sourceFiles('src');
const sourceLines = files.reduce((sum, file) => sum + lines(file), 0);
const testFiles = files.filter((file) => /\.test\.tsx?$/.test(file));
const testLines = testFiles.reduce((sum, file) => sum + lines(file), 0);
const oversized = files
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .map((file) => ({ path: relative(process.cwd(), file).split(sep).join('/'), lines: lines(file) }))
  .filter((file) => file.lines > MAX_LINES)
  .sort((a, b) => b.lines - a.lines);

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const commit = execFileSync('git', ['log', '-1', '--format=%h %ad', '--date=short'], {
  encoding: 'utf8',
}).trim();
const todo = readFileSync('docs/todo.md', 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('- ')).length;
const gates = readdirSync('scripts')
  .filter((name) => /^check.*\.mjs$/.test(name))
  .sort();

const rows = [];
const add = (label, value) => rows.push([label, value]);

add('version', `${packageJson.version}  (${commit})`);
add('tests', `${testFiles.length} files, ${testLines.toLocaleString()} lines`);
add(
  'source',
  `${sourceLines.toLocaleString()} lines in ${files.filter((file) => !/\.test\./.test(file)).length} files`,
);
add(
  'dependencies',
  `${Object.keys(packageJson.dependencies).length} runtime, ${Object.keys(packageJson.devDependencies).length} dev`,
);
add('debt', `${todo} open items in docs/todo.md`);
add('gates', `${gates.length} scripts: ${gates.join(', ')}`);
add('size ratchet', `${oversized.length} files over ${MAX_LINES} lines, none may grow`);

if (existsSync('out/renderer/assets')) {
  const bundle = measureBundle();
  const budget = JSON.parse(readFileSync(new URL('./bundleBudget.json', import.meta.url), 'utf8'));
  const share = (actual, cap) =>
    `${(actual / 1024).toFixed(0)}KB gz / ${(cap / 1024).toFixed(0)}KB cap`;
  add('bundle entry', share(bundle.entryGzipBytes, budget.entryGzipBytes));
  add(
    'bundle total',
    `${share(bundle.totalGzipBytes, budget.totalGzipBytes)} in ${bundle.chunkCount} chunks`,
  );
} else {
  add('bundle', 'no build in out/ — run "npm run build" to measure it');
}

const width = Math.max(...rows.map(([label]) => label.length));
for (const [label, value] of rows) console.log(`${label.padEnd(width)}  ${value}`);

if (oversized.length > 0) {
  console.log(`\nover ${MAX_LINES} lines:`);
  for (const file of oversized) console.log(`  ${String(file.lines).padStart(5)}  ${file.path}`);
}
