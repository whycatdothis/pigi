/**
 * Screenshots the built site for visual review.
 *
 * Serves `website/dist` from a throwaway static server, opens it in Chromium at a
 * desktop viewport, and writes one full-page PNG plus one per section, so a
 * change can be looked at instead of imagined.
 *
 *   node scripts/shoot.mjs              # both pages, 1440 wide
 *   node scripts/shoot.mjs 1280         # a different viewport width
 *
 * Playwright comes from the repository root, which already depends on it for the
 * app's browser test layer — the site does not install a second copy.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { stubReleaseApi } from './releaseFixture.mjs';

const ROOT = resolve(import.meta.dirname, '..', 'dist');
const OUT_DIR = resolve(import.meta.dirname, '..', '.shots');
const width = Number(process.argv[2] ?? 1440);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const pathname = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
  try {
    const body = await readFile(join(ROOT, pathname));
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(pathname)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

await new Promise((done) => server.listen(0, done));
const { port } = server.address();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });

const failures = [];
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));

// Same canned release the verify script uses: a screenshot run should not depend
// on GitHub's rate limit, and a rate-limited API is not a console error to fix.
await stubReleaseApi(page);

for (const [slug, route] of [
  ['home', '/'],
  ['changelog', '/changelog/'],
]) {
  await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

  await page.screenshot({ path: join(OUT_DIR, `${slug}-full-${width}.png`), fullPage: true });

  // Per-section shots: a full page this tall is unreadable in one image.
  const sections = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main > section, main > div')).map((section, index) => {
      const rect = section.getBoundingClientRect();
      return { index, top: Math.round(rect.top + window.scrollY), height: Math.round(rect.height) };
    }),
  );
  if (sections.length === 0) {
    await page.screenshot({ path: join(OUT_DIR, `${slug}-section-00.png`), fullPage: true });
  }

  for (const section of sections) {
    await page.screenshot({
      path: join(OUT_DIR, `${slug}-section-${String(section.index).padStart(2, '0')}.png`),
      fullPage: true,
      clip: { x: 0, y: section.top, width, height: Math.min(section.height, 2400) },
    });
  }

  console.log(`${slug}: ${sections.length} sections`);
}

console.log(`viewport ${width}px -> ${OUT_DIR}`);
if (failures.length > 0) {
  console.log('PAGE ERRORS:');
  for (const failure of failures) console.log('  ' + failure);
} else {
  console.log('no console errors');
}

await browser.close();
server.close();
