/**
 * Checks that the classes this site copied out of the app are still the app's.
 *
 * `src/lib/appUi.ts` copies shadcn class strings verbatim instead of reinventing
 * them; that is only worth doing if someone notices when the app moves on. This
 * walks every group in that file and asserts each Tailwind class still appears in
 * the app file the group names — as a whole class, matched against the source
 * with all whitespace collapsed, so a string rewrapped by Prettier or split
 * across a `cn(...)` call does not read as a change.
 *
 * It is a smoke alarm, not a proof: it does not know which element in the app the
 * string belongs to, so a class that moved between two components of the same file
 * passes. What it catches is the real drift — a class renamed, deleted, or
 * replaced in the app, which is exactly what would leave the page quietly drawing
 * an interface the app no longer has.
 *
 *   node scripts/checkAppClassDrift.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { APP_UI_GROUPS } from '../src/lib/appUi.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** The app's source with whitespace collapsed, so a wrapped string still matches. */
async function readCollapsed(path) {
  const source = await readFile(resolve(ROOT, path), 'utf8');
  return source.replace(/\s+/g, ' ');
}

/** Every class in a string, as Tailwind would read them. */
function classesOf(value) {
  return value.split(/\s+/).filter(Boolean);
}

const problems = [];
let checked = 0;

for (const [name, group] of Object.entries(APP_UI_GROUPS)) {
  const paths = [group.source, ...(group.alsoFrom ?? [])];
  const sources = await Promise.all(paths.map((path) => readCollapsed(path)));
  const siteClasses = new Set(group.siteClasses ?? []);

  for (const className of classesOf(group.classes)) {
    if (siteClasses.has(className)) continue;
    checked += 1;
    // A class is "an app class" if it appears in any of the files the group came
    // from; a call-site override lives in a second file, not in the same one.
    const found = sources.some((source) => source.includes(className));
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
