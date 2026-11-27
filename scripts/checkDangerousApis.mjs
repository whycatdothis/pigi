#!/usr/bin/env node
/**
 * The handful of APIs that bypass the app's own boundaries, each with the one
 * or two files allowed to call it. A new call site is not necessarily wrong —
 * it is a decision that has to be made in the diff instead of appearing in a
 * file nobody re-reads.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** `files` are repo-relative; every other match is a violation. */
const RULES = [
  {
    name: 'shell.openExternal',
    pattern: /\bshell\.openExternal\(/g,
    files: ['src/main/index.ts', 'src/main/windows/windowNavigation.ts'],
    why: 'opening a URL is a navigation, and it must pass the scheme allowlist in these two files',
  },
  {
    name: 'dangerouslySetInnerHTML',
    pattern: /dangerouslySetInnerHTML/g,
    files: ['src/renderer/src/components/message/mermaidDiagram.tsx'],
    why: 'raw HTML from a parser is a sanitizer bypass anywhere else; the Mermaid renderer is strict-mode and reviewed',
  },
  {
    name: 'eval / new Function',
    pattern: /\beval\(|\bnew Function\(/g,
    files: [],
    why: 'the CSP forbids unsafe-eval, and a bundler cannot audit code built from strings',
  },
];

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(tsx?|mjs|cjs)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
for (const file of sourceFiles('src')) {
  const path = relative(process.cwd(), file).split(sep).join('/');
  const source = readFileSync(file, 'utf8');
  for (const rule of RULES) {
    for (const match of source.matchAll(rule.pattern)) {
      if (rule.files.includes(path)) continue;
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${path}:${line}: ${rule.name} — ${rule.why}`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  console.error(`\n${violations.length} unmatched use(s) of an API that needs review.`);
  process.exit(1);
}
console.log('Dangerous APIs: every call site is on its allowlist.');
