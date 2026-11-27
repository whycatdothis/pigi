#!/usr/bin/env node
/**
 * A file-size ratchet for the four files that already grew until nobody could
 * hold them in their head (`App.tsx`, `transcriptController.ts`, `piAgent.ts`,
 * `chatInput`). A hard 800-line limit would demand a refactor nobody scheduled;
 * a ratchet demands only that nothing gets worse. Shrinking is recorded by
 * `--update`, so the new, lower number is a reviewed line in the diff.
 *
 * A new file may not start over the limit, and an existing one may not grow
 * past the number recorded here. `--update` records the current sizes — a
 * deliberate commit, which is the point.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 800;
const SOURCE_ROOT = 'src';
const BUDGET_PATH = new URL('./fileSizeBudget.json', import.meta.url);

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

function lineCounts() {
  const counts = new Map();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const path = relative(process.cwd(), file).split(sep).join('/');
    counts.set(path, readFileSync(file, 'utf8').split('\n').length - 1);
  }
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const counts = lineCounts();
  if (process.argv.includes('--update')) {
    const budget = {};
    for (const [path, lines] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
      if (lines > MAX_LINES) budget[path] = lines;
    }
    writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, 2)}\n`);
    console.log(`Recorded ${Object.keys(budget).length} files over ${MAX_LINES} lines.`);
  }

  const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
  const failures = [];
  for (const [path, lines] of counts) {
    const allowed = Math.max(MAX_LINES, budget[path] ?? 0);
    if (lines > allowed) {
      const growth = budget[path] === undefined ? 'new file over the limit' : `+${lines - allowed}`;
      failures.push(`  ${path}: ${lines} lines (max ${allowed}, ${growth})`);
    }
  }
  if (failures.length > 0) {
    console.error('Files past their size budget:\n');
    console.error(failures.join('\n'));
    console.error(
      '\nSplit the file, or record the growth deliberately with' +
        ' "node scripts/checkFileSize.mjs --update".',
    );
    process.exit(1);
  }
  const oversized = Object.keys(budget).filter((path) => counts.has(path)).length;
  console.log(`File sizes ok (${oversized} files over ${MAX_LINES} lines, none grew).`);
}
