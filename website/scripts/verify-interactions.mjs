/**
 * Checks that the page's interactive pieces actually work.
 *
 * Not a unit test suite: this drives the built page in a real browser, the way a
 * visitor would, and asserts on what changed. Run it after changing anything in
 * src/scripts or the components those scripts bind to.
 *
 *   node scripts/verify-interactions.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  CANDIDATE_ASSET,
  CANDIDATE_DOWNLOAD_URL,
  CANDIDATE_VERSION,
  stubReleaseApi,
} from './releaseFixture.mjs';

const ROOT = resolve(import.meta.dirname, '..', 'dist');
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/*
 * A canned release, so the download checks below test this page's logic instead of
 * GitHub's availability: an unauthenticated API call is rate-limited to 60 an
 * hour, and a run that trips it would report the fallback link as a failure.
 */
await stubReleaseApi(page);
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
}

// --- theme ------------------------------------------------------------------
{
  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload({ waitUntil: 'networkidle' });
  const fromSystem = await page.evaluate(() => document.documentElement.className);
  check('theme: an untouched browser follows the system', fromSystem === 'dark', fromSystem);

  await page.click('[data-theme-toggle]');
  const afterClick = await page.evaluate(() => ({
    className: document.documentElement.className,
    stored: localStorage.getItem('theme'),
    colorScheme: document.documentElement.style.colorScheme,
  }));
  check(
    'theme: the toggle flips it and remembers the choice',
    afterClick.className === '' &&
      afterClick.stored === 'light' &&
      afterClick.colorScheme === 'light',
    JSON.stringify(afterClick),
  );

  await page.reload({ waitUntil: 'networkidle' });
  const afterReload = await page.evaluate(() => document.documentElement.className);
  check('theme: the choice survives a reload', afterReload === '', `class="${afterReload}"`);

  await page.emulateMedia({ colorScheme: 'light' });
}

// --- view modes -------------------------------------------------------------
{
  const root = page.locator('[data-view-modes]');
  const menu = root.locator('[data-view-mode-menu]');

  const initial = await root.getAttribute('data-active');
  check('view modes: starts on Minimal', initial === 'minimal', String(initial));
  check(
    'view modes: the menu ships open, on the checked item',
    (await menu.getAttribute('data-open')) === 'true',
    String(await menu.getAttribute('data-open')),
  );

  // The menu closes as soon as an item is taken, so every choice after the first
  // starts by reopening it — which is also what a visitor does.
  const chooseMode = async (mode) => {
    if ((await menu.getAttribute('data-open')) !== 'true') {
      await page.click('[data-view-modes] [data-view-menu-trigger]');
    }
    await page.click(`[data-view-modes] [data-view-mode-button="${mode}"]`);
  };

  for (const mode of ['compact', 'all', 'minimal']) {
    await chooseMode(mode);
    const state = await page.evaluate(() => {
      const window = document.querySelector('[data-view-modes]');
      const menu = window.querySelector('[data-view-mode-menu]');
      const shown = [...window.querySelectorAll('[data-view-panel]')].filter(
        (panel) => getComputedStyle(panel).display !== 'none',
      );
      const checked = [...menu.querySelectorAll('[data-view-mode-button]')]
        .filter((button) => button.dataset.active === 'true')
        .map((button) => button.dataset.viewModeButton);
      const selected = [...menu.querySelectorAll('[data-view-mode-button]')].filter(
        (button) => button.getAttribute('aria-checked') === 'true',
      );
      return {
        active: window.dataset.active,
        shown: shown.map((panel) => panel.dataset.viewPanel),
        checked,
        checkedCount: selected.length,
        menuOpen: menu.dataset.open,
      };
    });
    check(
      `view modes: choosing ${mode} shows that panel, checks that item, and closes the menu`,
      state.active === mode &&
        state.shown.length === 1 &&
        state.shown[0] === mode &&
        state.checked.length === 1 &&
        state.checked[0] === mode &&
        state.checkedCount === 1 &&
        state.menuOpen === 'false',
      JSON.stringify(state),
    );
  }

  await page.click('[data-view-modes] [data-view-menu-trigger]');
  const reopened = await menu.getAttribute('data-open');
  await page.click('h1');
  const afterOutsideClick = await menu.getAttribute('data-open');
  check(
    'view modes: the button reopens the menu and an outside click closes it',
    reopened === 'true' && afterOutsideClick === 'false',
    `reopened=${reopened} afterOutsideClick=${afterOutsideClick}`,
  );
}

// --- minimap ----------------------------------------------------------------
{
  const scope = page.locator('[data-minimap-scope]');
  const litIndex = () =>
    scope
      .locator('[data-minimap-bar]')
      .evaluateAll((bars) => bars.findIndex((bar) => bar.style.backgroundColor.includes('accent')));

  const litCount = await scope
    .locator('[data-minimap-bar]')
    .evaluateAll(
      (bars) => bars.filter((bar) => bar.style.backgroundColor.includes('accent')).length,
    );
  check('minimap: exactly one bar is lit', litCount === 1, `lit=${litCount}`);

  await scope.locator('[data-minimap-scroll]').evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.waitForTimeout(200);
  const atTop = await litIndex();
  check('minimap: scrolling to the top moves the light up', atTop === 0, `lit=${atTop}`);

  await scope.locator('[data-minimap-scroll]').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.waitForTimeout(200);
  const atBottom = await litIndex();
  check(
    'minimap: scrolling to the bottom moves it to the newest',
    atBottom === 7,
    `lit=${atBottom}`,
  );

  await scope.locator('[data-minimap]').hover();
  await page.waitForTimeout(400);
  const panelOpen = await scope.locator('[data-minimap-panel]').getAttribute('data-open');
  const panelVisible = await scope.locator('[data-minimap-panel]').isVisible();
  check(
    'minimap: hovering the strip opens the list',
    panelOpen === 'true' && panelVisible,
    `open=${panelOpen} visible=${panelVisible}`,
  );

  await scope.locator('[data-minimap-entry]').first().click();
  await page.waitForTimeout(800);
  const scrollTop = await scope.locator('[data-minimap-scroll]').evaluate((node) => node.scrollTop);
  check(
    'minimap: clicking an entry jumps to that message',
    scrollTop < 40,
    `scrollTop=${scrollTop}`,
  );
}

// --- session tree -----------------------------------------------------------
{
  const tree = page.locator('[data-tree]');
  const rails = () =>
    tree
      .locator('[data-tree-rails] > span')
      .evaluateAll((spans) => spans.map((span) => span.style.height));

  const restingRails = await rails();

  // The last row is on the wrong branch, so lighting it must change the lines.
  await tree.locator('[data-row-id="u5"]').hover();
  await page.waitForTimeout(450);

  const hoveredRails = await rails();
  check(
    'session tree: hovering a row moves the light',
    JSON.stringify(restingRails) !== JSON.stringify(hoveredRails),
    `${JSON.stringify(restingRails)} -> ${JSON.stringify(hoveredRails)}`,
  );

  const previewOpen = await tree.locator('[data-tree-preview]').getAttribute('data-open');
  check('session tree: hovering opens the preview', previewOpen === 'true', String(previewOpen));

  await tree.locator('[data-row-id="u2"]').click();
  await page.waitForTimeout(120);
  const currentId = await tree
    .locator('[data-tree-row][data-current="true"]')
    .getAttribute('data-row-id');
  const chipCount = await tree.locator('.tree-row-chip:visible').count();
  check(
    'session tree: clicking moves the session',
    currentId === 'u2' && chipCount === 1,
    `current=${currentId} chips=${chipCount}`,
  );

  await page.mouse.move(10, 10);
}

// --- session switcher -------------------------------------------------------
{
  const switcher = page.locator('[data-session-switcher]');
  const visibleRows = () => switcher.locator('[data-switcher-row]:visible').count();

  const before = await visibleRows();
  check('switcher: starts with every session', before === 9, `visible=${before}`);

  await switcher.locator('[data-switcher-input]').fill('mmw');
  const after = await visibleRows();
  const marked = await switcher.locator('[data-switcher-title] mark').allTextContents();
  check(
    'switcher: a subsequence narrows the list and marks the letters',
    after === 1 && marked.join('').toLowerCase() === 'mmw',
    `visible=${after} marks=${JSON.stringify(marked)}`,
  );

  await switcher.locator('[data-switcher-input]').fill('zzz');
  const empty = await switcher.locator('[data-switcher-empty]').isVisible();
  check('switcher: no match shows the empty state', empty, String(empty));

  await switcher.locator('[data-switcher-input]').fill('');
  await switcher.locator('[data-switcher-input]').press('ArrowDown');
  const selectedTitle = await switcher
    .locator('[data-switcher-row][data-selected="true"]')
    .getAttribute('data-title');
  check(
    'switcher: the down arrow moves the selection',
    selectedTitle === 'Minimap widths while resizing',
    String(selectedTitle),
  );

  await switcher.locator('[data-switcher-input]').press('Escape');
  const reset = await visibleRows();
  check('switcher: escape clears the query', reset === 9, `visible=${reset}`);
}

// --- terminal ---------------------------------------------------------------
{
  const tabs = page.locator('[data-terminal-tab]');
  await tabs.nth(1).click();
  const state = await tabs.evaluateAll((nodes) =>
    nodes.map((node) => ({ tab: node.dataset.terminalTab, active: node.dataset.active })),
  );
  check(
    'terminal: clicking a tab activates it and only it',
    state[1].active === 'true' && state[0].active === 'false',
    JSON.stringify(state),
  );
}

// --- download ---------------------------------------------------------------
{
  // Every button, because rewriting only the first one is the bug this catches.
  const links = await page.locator('[data-download-link]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href'),
      version: node.dataset.umamiEventVersion,
      asset: node.dataset.umamiEventAsset,
    })),
  );

  check(
    'download: every button points at the newest DMG',
    links.length === 2 && links.every((link) => link.href === CANDIDATE_DOWNLOAD_URL),
    JSON.stringify(links.map((link) => link.href)),
  );
  check(
    'download: the tracked event carries the resolved version and asset',
    links.every((link) => link.version === CANDIDATE_VERSION && link.asset === CANDIDATE_ASSET),
    JSON.stringify(links),
  );
}

// --- reporting --------------------------------------------------------------
let failed = 0;
for (const result of results) {
  if (!result.passed) failed += 1;
  console.log(
    `${result.passed ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? `  (${result.detail})` : ''}`,
  );
}
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
server.close();
process.exit(failed === 0 ? 0 : 1);
