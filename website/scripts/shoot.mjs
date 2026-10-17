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

for (const [slug, route] of [
  ['home', '/'],
  ['changelog', '/changelog/'],
]) {
  await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

  await page.screenshot({ path: join(OUT_DIR, `${slug}-full-${width}.png`), fullPage: true });

  // Per-section shots: a full page this tall is unreadable in one image.
  // The page's own bands, not the `<main>` inside every recreated window: those are
  // transcripts, and a shot of one is a shot of the app, not of a section.
  const sections = await page.evaluate(() => {
    const page = document.querySelector('body > main');
    if (page === null) return [];
    return Array.from(page.children)
      .filter((child) => child instanceof HTMLElement)
      .map((child, index) => {
        const rect = child.getBoundingClientRect();
        return {
          index,
          top: Math.round(rect.top + window.scrollY),
          height: Math.round(rect.height),
        };
      });
  });
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

  /*
   * The tour's window is pinned, and a sticky element is painted once in a
   * full-page capture — at the top of its section, with the rest of the section
   * empty. So it gets scrolled through instead: one viewport shot per chapter.
   */
  if (route === '/' && width >= 1024) {
    const stops = await page.evaluate(() =>
      [...document.querySelectorAll('[data-stage-copy]')].map((chapter) =>
        Math.round(
          chapter.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4 + 1,
        ),
      ),
    );
    for (const [index, top] of stops.entries()) {
      await page.evaluate((y) => window.scrollTo(0, y), top);
      await page.waitForTimeout(450);
      await page.screenshot({
        path: join(OUT_DIR, `${slug}-tour-${String(index).padStart(2, '0')}.png`),
      });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
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
