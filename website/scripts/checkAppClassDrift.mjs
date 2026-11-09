// Asserts each class copied into src/lib/appUi.ts still appears, as a whole class
// inside a string literal, in the app file its group names. Catches renames and
// deletions, not classes moved between components of the same file.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { APP_UI_GROUPS } from '../src/lib/appUi.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');

const STRING_LITERAL = /'[^'\n]*'|"[^"\n]*"|`[^`]*`/g;

// Only string literals count: prose in the file contains words that look like utilities.
async function readAppClasses(path) {
  const source = await readFile(resolve(ROOT, path), 'utf8');
  const classes = new Set();
  for (const [literal] of source.matchAll(STRING_LITERAL)) {
    for (const token of literal.slice(1, -1).split(/\s+/)) {
      // A template literal swallows strings nested in its `${}`; strip their quotes.
      const className = token.replace(/^[$'"{]+|['"}]+$/g, '');
      if (className) classes.add(className);
    }
  }
  return classes;
}

const problems = [];
let checked = 0;

for (const [name, group] of Object.entries(APP_UI_GROUPS)) {
  const paths = [group.source, ...(group.alsoFrom ?? [])];
  const sources = await Promise.all(paths.map((path) => readAppClasses(path)));
  const siteClasses = new Set(group.siteClasses ?? []);

  for (const className of group.classes.split(/\s+/).filter(Boolean)) {
    if (siteClasses.has(className)) continue;
    checked += 1;
    const found = sources.some((classes) => classes.has(className));
    if (!found) problems.push(`${name}: \`${className}\` is not in ${paths.join(' or ')}`);
  }
}

if (problems.length > 0) {
  console.error(`${problems.length} class(es) no longer match the app:`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nUpdate src/lib/appUi.ts from the app files, then re-run the page checks.');
  process.exit(1);
}

console.log(`${checked} copied classes still match the app`);
