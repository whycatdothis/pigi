#!/usr/bin/env node
/**
 * Fails when the built renderer CSS contains a viewport-width media query.
 *
 * Crossing a width media query makes Blink rebuild the (layered) stylesheet,
 * which invalidates every font and re-lays out the whole document. During a
 * native window resize that costs 60-80ms per crossing and shows up as the
 * message list jumping. Run after `electron-vite build`.
 */
import fs from 'node:fs';
import path from 'node:path';

const cssDirectory = path.resolve('out/renderer/assets');
const WIDTH_MEDIA_QUERY = /@media[^{]*\b(min-width|max-width|width\s*[<>]=?)/g;

if (!fs.existsSync(cssDirectory)) {
  console.error(`checkCssMediaQueries: ${cssDirectory} not found; run the build first`);
  process.exit(1);
}

const failures = [];
for (const fileName of fs.readdirSync(cssDirectory)) {
  if (!fileName.endsWith('.css')) {
    continue;
  }
  const css = fs.readFileSync(path.join(cssDirectory, fileName), 'utf8');
  for (const match of css.matchAll(WIDTH_MEDIA_QUERY)) {
    failures.push(`${fileName}: ${match[0].trim()}`);
  }
}

if (failures.length > 0) {
  console.error(
    'Viewport-width media queries found in built CSS (see AGENTS.md, Resize and Layout Performance):',
  );
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}
console.log('checkCssMediaQueries: no viewport-width media queries in built CSS');
