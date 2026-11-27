#!/usr/bin/env node
/**
 * The renderer's entry chunk is parsed before the first frame, and it only ever
 * grows: the emacs-lisp grammar is 780KB, xterm and mermaid ship in the chat
 * entry because dynamic imports are banned. `9f6a756` halved the bundle; three
 * months later nothing remembered it.
 *
 * These caps are the measured build plus a few percent. Exceeding one fails the
 * build, so getting bigger is a deliberate edit to `bundleBudget.json` in the
 * diff — a reviewed decision instead of drift.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ASSETS_DIRECTORY = 'out/renderer/assets';
const INDEX_HTML = 'out/renderer/index.html';
const BUDGET_PATH = new URL('./bundleBudget.json', import.meta.url);
const HEADROOM = 1.03;

/** Gzip bytes of every JavaScript asset, and the entry chunk's own. */
export function measureBundle() {
  const entryMatch = readFileSync(INDEX_HTML, 'utf8').match(/assets\/(index-[^"']+\.js)/);
  if (!entryMatch) throw new Error(`no entry chunk in ${INDEX_HTML}: run "npm run build" first`);
  const entry = entryMatch[1];
  const chunks = [];
  for (const name of readdirSync(ASSETS_DIRECTORY)) {
    if (!name.endsWith('.js')) continue;
    const source = readFileSync(join(ASSETS_DIRECTORY, name));
    chunks.push({ name, gzipBytes: gzipSync(source, { level: 9 }).byteLength });
  }
  chunks.sort((a, b) => b.gzipBytes - a.gzipBytes);
  return {
    entry,
    entryGzipBytes: chunks.find((chunk) => chunk.name === entry)?.gzipBytes ?? 0,
    largest: chunks[0],
    totalGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
    chunkCount: chunks.length,
  };
}

function kilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(ASSETS_DIRECTORY)) {
    console.error(`No build at ${ASSETS_DIRECTORY}: run "npm run build" first.`);
    process.exit(1);
  }
  const measured = measureBundle();
  if (process.argv.includes('--update')) {
    const budget = {
      note: 'Gzip caps; re-baselining is a deliberate commit (see checkBundleBudget.mjs).',
      entryGzipBytes: Math.ceil(measured.entryGzipBytes * HEADROOM),
      largestChunkGzipBytes: Math.ceil(measured.largest.gzipBytes * HEADROOM),
      totalGzipBytes: Math.ceil(measured.totalGzipBytes * HEADROOM),
    };
    writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, 2)}\n`);
    console.log(`Wrote ${BUDGET_PATH.pathname}`);
  }

  const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
  const rows = [
    ['entry chunk', measured.entryGzipBytes, budget.entryGzipBytes],
    ['largest chunk', measured.largest.gzipBytes, budget.largestChunkGzipBytes],
    ['all JavaScript', measured.totalGzipBytes, budget.totalGzipBytes],
  ];
  let failed = false;
  for (const [label, actual, cap] of rows) {
    const state = actual > cap ? 'OVER' : 'ok';
    if (actual > cap) failed = true;
    console.log(
      `${label.padEnd(16)} ${kilobytes(actual).padStart(9)} / ${kilobytes(cap).padStart(9)}  ${state}`,
    );
  }
  if (failed) {
    console.error(
      '\nThe bundle grew past its budget. Shrink it, or re-baseline with\n' +
        '"node scripts/checkBundleBudget.mjs --update" as a commit of its own\n' +
        'so the growth is a visible decision.',
    );
    process.exit(1);
  }
}
