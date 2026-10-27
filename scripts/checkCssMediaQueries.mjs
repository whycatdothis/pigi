#!/usr/bin/env node
/**
 * Fails when renderer CSS contains a viewport-width media query.
 *
 * Crossing a width media query makes Blink rebuild the (layered) stylesheet,
 * which invalidates every font and re-lays out the whole document. During a
 * native window resize that costs 60-80ms per crossing and shows up as the
 * message list jumping.
 *
 * Checks the built stylesheet when there is one, because that is the CSS that
 * ships, including whatever a dependency injected. Without a build it checks the
 * app's own sources, so the rule still holds in CI, which does not build.
 */
import fs from 'node:fs';
import path from 'node:path';

const BUILT_CSS_DIRECTORY = path.resolve('out/renderer/assets');
const SOURCE_CSS_DIRECTORY = path.resolve('src/renderer/src');
const WIDTH_MEDIA_QUERY = /@media[^{]*\b(min-width|max-width|width\s*[<>]=?)/g;

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(entryPath);
      continue;
    }
    if (entry.name.endsWith('.css')) {
      yield entryPath;
    }
  }
}

function cssFiles() {
  if (fs.existsSync(BUILT_CSS_DIRECTORY)) {
    return {
      description: 'built CSS',
      files: fs
        .readdirSync(BUILT_CSS_DIRECTORY)
        .filter((fileName) => fileName.endsWith('.css'))
        .map((fileName) => path.join(BUILT_CSS_DIRECTORY, fileName)),
    };
  }
  return { description: 'source CSS (no build output)', files: [...walk(SOURCE_CSS_DIRECTORY)] };
}

const { description, files } = cssFiles();
const failures = [];
for (const filePath of files) {
  const css = fs.readFileSync(filePath, 'utf8');
  const relative = path.relative(process.cwd(), filePath);
  for (const match of css.matchAll(WIDTH_MEDIA_QUERY)) {
    failures.push(`${relative}: ${match[0].trim()}`);
  }
}

if (failures.length > 0) {
  console.error(
    `Viewport-width media queries found in ${description} (see AGENTS.md, Resize and Layout Performance):`,
  );
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(`checkCssMediaQueries: no viewport-width media queries in ${description}`);
