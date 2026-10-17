/**
 * Checks that the page's interactive pieces actually work.
 *
 * Not a unit test suite: this drives the built page in a real browser, the way a
 * visitor would, and asserts on what changed. Run it after changing anything in
 * src/scripts or the components those scripts bind to.
 *
 * The last section is the one exception to "interactions": it opens the page at
 * phone and tablet widths and asserts the shape a window has to keep there — the
 * app's own minimum width, scaled, with nothing sideways and no dialog hanging
 * out of it. That contract lives in `AppWindow.astro` and `initWindowFits`, and
 * the way it breaks is quietly.
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

/**
 * Shows one step of the feature tour.
 *
 * From `lg` up the tour is driven by the scroll: the window is pinned and each
 * chapter brings its own still, so showing a step means scrolling that chapter to
 * the line the page reads at. Below `lg` the index is the control and showing a
 * step means clicking its chip. Both are what a visitor does, which is the point
 * of driving the page instead of calling into it.
 */
async function showStep(index) {
  const outcome = await page.evaluate((position) => {
    const chapter = document.querySelectorAll('[data-stage-copy]')[position];
    const chip = document.querySelectorAll('[data-stage-chip]')[position];
    if (!(chapter instanceof HTMLElement)) return 'missing';
    // `checkVisibility` rather than the chip's own `display`: below `lg` the whole
    // index row is what is hidden, so the chip itself still computes to `flex`.
    if (!(chip instanceof HTMLElement) || !chip.checkVisibility()) {
      document.documentElement.style.scrollBehavior = 'auto';
      const line = window.innerHeight * 0.4;
      window.scrollTo({
        top: chapter.getBoundingClientRect().top + window.scrollY - line + 1,
        behavior: 'instant',
      });
      return 'scrolled';
    }
    chip.click();
    return 'clicked';
  }, index);
  if (outcome !== 'missing') await page.waitForTimeout(450);
  return outcome !== 'missing';
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

// --- the toolbar's tooltips -------------------------------------------------
{
  /*
   * The app's `?` is a button, and its home is inside a Radix tooltip — a portal
   * that floats over the page and takes the pointer. A still's tooltip is a span
   * that fades in under the pointer and keeps `pointer-events: none`, so the same
   * button there can never be pressed, and at `opacity: 0` it is still in the tab
   * order: ten windows meant ten invisible tab stops whose only action was
   * nothing. The `?` that survives is the one in the tree dialog's own header,
   * which is visible at rest and reaches the dialog it opens.
   */
  // The tree's chapter, where the dialog and its header are actually drawn.
  await showStep(4);
  const toggles = await page.evaluate(() =>
    [...document.querySelectorAll('[data-tree-help-toggle]')].map((toggle) => {
      const tooltip = toggle.closest('.app-tooltip');
      return {
        inTooltip: tooltip !== null,
        inDialog: toggle.closest('[role="dialog"]') !== null,
        visible: getComputedStyle(toggle).visibility !== 'hidden' && toggle.checkVisibility(),
      };
    }),
  );
  check(
    'toolbar: no `?` is hidden inside a tooltip, where it cannot be pressed',
    toggles.every((entry) => !entry.inTooltip),
    JSON.stringify(toggles),
  );
  check(
    'toolbar: the `?` that is left is in the tree dialog, and drawn',
    toggles.length > 0 && toggles.every((entry) => entry.inDialog && entry.visible),
    JSON.stringify(toggles),
  );
  await showStep(0);
}

// --- feature tour -----------------------------------------------------------
{
  const state = () =>
    page.evaluate(() => ({
      chapters: [...document.querySelectorAll('[data-stage-copy]')]
        .map((panel, index) => [index, getComputedStyle(panel).visibility !== 'hidden'])
        .filter(([, shown]) => shown)
        .map(([index]) => index),
      stills: [...document.querySelectorAll('[data-stage-layer]')]
        .map((layer, index) => [index, layer.dataset.active, getComputedStyle(layer).visibility])
        .filter(([, active]) => active === 'true')
        .map(([index]) => index),
      current: [...document.querySelectorAll('[data-stage-copy]')].findIndex(
        (panel) => panel.dataset.current === 'true',
      ),
    }));

  const atLoad = await state();
  check(
    'tour: every chapter is on the page, the first one on the window',
    JSON.stringify(atLoad) ===
      JSON.stringify({ chapters: [0, 1, 2, 3, 4, 5, 6], stills: [0], current: 0 }),
    JSON.stringify(atLoad),
  );

  /*
   * The pinned window is the whole trick, and the way it breaks is that the
   * sticky rule stops applying — `align-self` on the grid item, or a taller
   * sibling — and the window scrolls off with its chapters.
   */
  const pinned = await page.evaluate(async () => {
    const settle = () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const chapter = document.querySelectorAll('[data-stage-copy]')[2];
    const still = document.querySelector('[data-stage-scene]');
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo({
      top: chapter.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4 + 1,
    });
    await settle();
    const before = Math.round(still.getBoundingClientRect().top);
    window.scrollBy(0, 240);
    await settle();
    return { before, after: Math.round(still.getBoundingClientRect().top) };
  });
  check(
    'tour: the window stays put while its chapters scroll past',
    pinned.before > 0 && pinned.after === pinned.before,
    JSON.stringify(pinned),
  );

  // Window on the left, words on the right: the still is read before its caption.
  const columns = await page.evaluate(() => {
    const rail = document.querySelector('[data-stage-rail]').getBoundingClientRect();
    const scene = document.querySelector('[data-stage-scene]').getBoundingClientRect();
    return { railLeft: Math.round(rail.left), sceneRight: Math.round(scene.right) };
  });
  check(
    'tour: the words sit to the right of the window',
    columns.railLeft > columns.sceneRight,
    JSON.stringify(columns),
  );

  /*
   * The still is the app's 1200x800 shrunk in one transform. If the scaler is
   * left at the frame's width the app is laid out narrower and scaled anyway,
   * which draws a window smaller than its column — the gap this catches.
   */
  const still = await page.evaluate(() => {
    const frame = document.querySelector('[data-stage-frame]').getBoundingClientRect();
    const canvas = document
      .querySelector('[data-stage-scaler]')
      .firstElementChild.getBoundingClientRect();
    return {
      frame: Math.round(frame.width),
      canvas: Math.round(canvas.width),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  check(
    'tour: the window fills the box reserved for it, and nothing scrolls sideways',
    Math.abs(still.frame - still.canvas) <= 1 && still.overflow === 0,
    JSON.stringify(still),
  );

  await showStep(3);
  const midTour = await state();
  check(
    'tour: the chapter at the reading line is the one on the window',
    JSON.stringify(midTour) ===
      JSON.stringify({ chapters: [0, 1, 2, 3, 4, 5, 6], stills: [3], current: 3 }),
    JSON.stringify(midTour),
  );

  // The still has to fit the screen it is pinned to, not just be scaled by width.
  const fitted = await page.evaluate(() => {
    const frame = document.querySelectorAll('[data-stage-frame]')[3].getBoundingClientRect();
    const header = document.querySelector('[data-site-header]').getBoundingClientRect();
    return {
      width: Math.round(frame.width),
      height: Math.round(frame.height),
      top: Math.round(frame.top),
      bottom: Math.round(frame.bottom),
      viewport: window.innerHeight,
      headerBottom: Math.round(header.bottom),
    };
  });
  check(
    'tour: the whole window is on screen, clear of the header',
    fitted.height > 300 && fitted.top >= fitted.headerBottom && fitted.bottom <= fitted.viewport,
    JSON.stringify(fitted),
  );

  /*
   * The instant-switch still has to switch: three sessions stacked in one cell,
   * one drawn at a time, the next one a second after the last. A portrait of a
   * single session cannot show what the chapter claims.
   */
  await showStep(2);
  const cycleState = () =>
    page.evaluate(() => {
      const frames = [...document.querySelectorAll('[data-session-frame]')];
      const open = frames.findIndex((frame) => frame.dataset.active === 'true');
      const check = (frame) =>
        [...frame.querySelectorAll('[data-sidebar-row]')]
          .filter((row) => row.className.includes('text-foreground'))
          .map((row) => row.dataset.sidebarRow);
      return {
        open,
        openCount: frames.filter((frame) => frame.dataset.active === 'true').length,
        title: frames[open].querySelector('[data-window-title]').dataset.windowTitle,
        rows: frames.map((frame) =>
          [...frame.querySelectorAll('[data-sidebar-row]')].map((row) => row.dataset.sidebarRow),
        ),
        selected: check(frames[open]),
      };
    });

  // Off the still, so the pointer does not hold it, and past one advance.
  await page.mouse.move(4, 4);
  const firstCycle = await cycleState();
  await page.waitForTimeout(1700);
  const secondCycle = await cycleState();
  check(
    'switch: the still opens another session on its own',
    firstCycle.openCount === 1 &&
      secondCycle.openCount === 1 &&
      secondCycle.open !== firstCycle.open,
    JSON.stringify({ first: firstCycle.open, second: secondCycle.open }),
  );
  check(
    'switch: the list stays put while the selection moves through it',
    firstCycle.rows.length === 3 &&
      JSON.stringify(firstCycle.rows) === JSON.stringify(secondCycle.rows) &&
      secondCycle.selected.length === 1 &&
      secondCycle.selected[0] === secondCycle.title,
    JSON.stringify({ rows: secondCycle.rows, selected: secondCycle.selected }),
  );

  /*
   * Three rows a window, one of them the fork under the session it came from.
   */
  const lists = await page.evaluate(() =>
    [...document.querySelectorAll('[data-window-fit]')].map((fit) => {
      const rows = [...fit.querySelectorAll('[data-sidebar-row]')];
      const marked = rows.filter((row) => row.className.includes('text-foreground'));
      return {
        title: fit.querySelector('[data-window-title]').dataset.windowTitle,
        count: rows.length,
        selected: marked.map((row) => row.dataset.sidebarRow),
        forks: rows
          .filter((row) => row.querySelector('[data-lineage-depth]') !== null)
          .map((row) => row.dataset.sidebarRow),
      };
    }),
  );
  check(
    'sidebar: every window lists three sessions, and the open one is one of them',
    lists.length > 0 &&
      lists.every(
        (list) => list.count === 3 && list.selected.length === 1 && list.selected[0] === list.title,
      ),
    JSON.stringify(lists.map((list) => [list.title, list.count, list.selected])),
  );
  check(
    'sidebar: the fork is listed under the session it came from',
    lists.filter((list) => list.forks.length === 1).length >= lists.length - 3,
    JSON.stringify(lists.map((list) => list.forks)),
  );

  await showStep(0);
}

// --- view modes -------------------------------------------------------------
{
  /*
   * The window opens the next density by itself every 1.5s, which is the claim the
   * chapter makes. The checks below have to be deterministic, so they run with the
   * timer held — the still's reduced-motion path, which is a real one — and the
   * cycling itself is checked separately, before anything is clicked.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showStep(1);
  const root = page.locator('[data-view-modes]');
  const menu = root.locator('[data-view-mode-menu]');

  const initial = await root.getAttribute('data-active');
  check('view modes: opens on Compact', initial === 'compact', String(initial));
  check(
    'view modes: the menu ships open, on the checked item',
    (await menu.getAttribute('data-open')) === 'true',
    String(await menu.getAttribute('data-open')),
  );

  const density = () =>
    page.evaluate(() => {
      const window_ = document.querySelector('[data-view-modes]');
      const menu_ = window_.querySelector('[data-view-mode-menu]');
      const shown = [...window_.querySelectorAll('[data-view-panel]')]
        .filter((panel) => getComputedStyle(panel).display !== 'none')
        .map((panel) => panel.dataset.viewPanel);
      const ticked = [...menu_.querySelectorAll('[data-view-mode-button]')]
        .filter((button) =>
          [...button.querySelectorAll('svg')].some(
            (icon) => getComputedStyle(icon).visibility !== 'hidden',
          ),
        )
        .map((button) => button.dataset.viewModeButton);
      return { active: window_.dataset.active, shown, ticked, open: menu_.dataset.open };
    });

  // Off the still, so the pointer does not hold it, and back to full motion.
  await page.emulateMedia({ reducedMotion: null });
  await page.mouse.move(4, 4);
  const before = await density();
  await page.waitForTimeout(1700);
  const cycled = await density();
  check(
    'view modes: the still opens the next density on its own, and the check goes with it',
    before.active === 'compact' &&
      cycled.active !== before.active &&
      cycled.shown.length === 1 &&
      cycled.shown[0] === cycled.active &&
      cycled.ticked.length === 1 &&
      cycled.ticked[0] === cycled.active &&
      cycled.open === 'true',
    JSON.stringify({ before: before.active, cycled }),
  );

  // The window keeps what a reader picks: the timer stops for good.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // The menu closes as soon as an item is taken, so every choice after the first
  // starts by reopening it — which is also what a visitor does.
  const chooseMode = async (mode) => {
    if ((await menu.getAttribute('data-open')) !== 'true') {
      await page.click('[data-view-modes] [data-view-menu-trigger]');
    }
    await page.click(`[data-view-modes] [data-view-mode-button="${mode}"]`);
  };

  for (const mode of ['all', 'minimal', 'compact']) {
    await chooseMode(mode);
    const state = await page.evaluate(() => {
      const window = document.querySelector('[data-view-modes]');
      const menu = window.querySelector('[data-view-mode-menu]');
      const shown = [...window.querySelectorAll('[data-view-panel]')].filter(
        (panel) => getComputedStyle(panel).display !== 'none',
      );
      // `data-state=checked` is the attribute the app's menu styles off, so it is
      // the one this asserts on.
      const checked = [...menu.querySelectorAll('[data-view-mode-button]')]
        .filter((button) => button.dataset.state === 'checked')
        .map((button) => button.dataset.viewModeButton);
      const selected = [...menu.querySelectorAll('[data-view-mode-button]')].filter(
        (button) => button.getAttribute('aria-checked') === 'true',
      );
      /*
       * The tick a visitor actually sees. Every item carries the icon and the
       * checked state shows it, so this counts the drawn ones rather than the
       * markup: an icon that exists only on the item that shipped active is
       * exactly the bug this catches, and it passes every attribute check above.
       */
      const ticked = [...menu.querySelectorAll('[data-view-mode-button]')]
        .filter((button) =>
          [...button.querySelectorAll('svg')].some(
            (icon) => getComputedStyle(icon).visibility !== 'hidden',
          ),
        )
        .map((button) => button.dataset.viewModeButton);
      return {
        active: window.dataset.active,
        shown: shown.map((panel) => panel.dataset.viewPanel),
        checked,
        checkedCount: selected.length,
        ticked,
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
        state.ticked.length === 1 &&
        state.ticked[0] === mode &&
        state.menuOpen === 'false',
      JSON.stringify(state),
    );
  }

  /*
   * Minimal keeps the turn folded behind its timer row, which is a button in the
   * app and has to be one here: the row opens the same entries the other two
   * panels draw, and the chevron turns with it.
   */
  await chooseMode('minimal');
  const timer = page.locator('[data-minimal-timer]');
  await timer.click();
  // The chevron rotates over the transition, so read it once it has arrived.
  await page.waitForTimeout(250);
  const unfolded = await page.evaluate(() => {
    const turn = document.querySelector('[data-minimal-turn]');
    const button = turn.querySelector('[data-minimal-timer]');
    const chevron = button.querySelector('svg');
    const details = turn.lastElementChild;
    const collapsed = details.previousElementSibling;
    return {
      open: turn.dataset.details,
      expanded: button.getAttribute('aria-expanded'),
      chevron: getComputedStyle(chevron).rotate,
      details: getComputedStyle(details).display,
      collapsed: getComputedStyle(collapsed).display,
      entries: details.querySelectorAll('.markdown-body').length,
    };
  });
  check(
    'view modes: the minimal timer unfolds the turn, and the chevron turns with it',
    unfolded.open === 'true' &&
      unfolded.expanded === 'true' &&
      unfolded.chevron === '90deg' &&
      unfolded.details !== 'none' &&
      unfolded.collapsed === 'none' &&
      unfolded.entries > 0,
    JSON.stringify(unfolded),
  );

  await timer.click();
  await page.waitForTimeout(250);
  const folded = await page.evaluate(() => {
    const turn = document.querySelector('[data-minimal-turn]');
    const chevron = turn.querySelector('[data-minimal-timer] svg');
    return {
      open: turn.dataset.details,
      chevron: getComputedStyle(chevron).rotate,
      details: getComputedStyle(turn.lastElementChild).display,
      collapsed: getComputedStyle(turn.lastElementChild.previousElementSibling).display,
    };
  });
  check(
    'view modes: clicking the timer again folds the turn back',
    folded.open === 'false' &&
      folded.chevron !== '90deg' &&
      folded.details === 'none' &&
      folded.collapsed !== 'none',
    JSON.stringify(folded),
  );

  // A short turn sits under the toolbar: the app's list has no `justify-end`, so
  // there is no gap above the first message to push it away from.
  await chooseMode('minimal');
  const above = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('[data-view-panel]')].find(
      (node) => getComputedStyle(node).display !== 'none',
    );
    const scroller = panel.querySelector('.overflow-y-auto');
    const first = scroller.firstElementChild.firstElementChild;
    return Math.round(first.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  });
  check('view modes: a short turn starts at the top', above <= 40, `gap=${above}px`);

  // A choice is final: nothing moves the window after one.
  await page.emulateMedia({ reducedMotion: null });
  const settled = await density();
  await page.waitForTimeout(1700);
  const stillSettled = await density();
  check(
    'view modes: a density a reader picked is not taken away a second later',
    settled.active !== undefined && stillSettled.active === settled.active,
    JSON.stringify({ settled: settled.active, after: stillSettled.active }),
  );

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

// --- the tree's explanation -------------------------------------------------
{
  await showStep(4);
  const dialog = page.locator('[data-tree-help]');
  const closed = await dialog.getAttribute('data-state');
  const hidden = await dialog.isVisible();
  check(
    'tree help: it ships closed, the way the app is until the `?` is clicked',
    closed === 'closed' && !hidden,
    `state=${closed} visible=${hidden}`,
  );

  // The `?` on the dialog itself: the window's own toolbar sits under the scrim the
  // dialog puts over everything, which is what the app does too.
  await page.locator('[data-tree-dialog] [data-tree-help-toggle]').first().click();
  await page.waitForTimeout(300);
  const opened = await dialog.getAttribute('data-state');
  const visible = await dialog.isVisible();
  check(
    'tree help: the ? in the tree opens it',
    opened === 'open' && visible,
    `state=${opened} visible=${visible}`,
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const escaped = await dialog.getAttribute('data-state');
  check('tree help: escape closes it', escaped === 'closed', String(escaped));

  await showStep(0);
}

// --- minimap ----------------------------------------------------------------
{
  await showStep(2);
  /*
   * The window here opens a session a second, and the first one is the long
   * session the minimap is drawn for. A reader who asked for less motion gets
   * that one and nothing else, which is also what makes these checks measure a
   * known list instead of whichever session happened to be open.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const openSession = await page.evaluate(() => {
    const frames = [...document.querySelectorAll('[data-session-frame]')];
    return frames.find((frame) => frame.dataset.active === 'true')?.dataset.sessionIndex;
  });
  check(
    'minimap: the still holds the long session for a reader who asked for less motion',
    openSession === '0',
    `open=${openSession}`,
  );
  const scope = page.locator('[data-session-frame][data-active="true"] [data-minimap-scope]');
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

  /*
   * A bar moves the transcript it belongs to, not the page.
   *
   * `scrollIntoView` also scrolls every scrollable ancestor, and the page is one:
   * the reader who clicked a bar in the window was thrown out of the chapter they
   * were reading, which on this page means the still they clicked in changed.
   */
  const pageBefore = await page.evaluate(() => {
    window.scrollBy({ top: 30, behavior: 'instant' });
    return window.scrollY;
  });
  await page.waitForTimeout(150);
  await scope.locator('[data-minimap-bar]').nth(2).click();
  await page.waitForTimeout(700);
  const pageAfter = await page.evaluate(() => window.scrollY);
  check(
    'minimap: a bar moves the transcript, not the page',
    Math.abs(pageAfter - pageBefore) <= 2,
    `${Math.round(pageBefore)} -> ${Math.round(pageAfter)}`,
  );

  // Off the strip: hovering it opens the list, and the list covers the bars.
  await page.mouse.move(4, 4);
  await page.waitForTimeout(500);

  // Back to the newest message, which is what the bar above would have picked.
  await scope.locator('[data-minimap-scroll]').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.waitForTimeout(200);

  await scope.locator('[data-minimap]').hover();
  await page.waitForTimeout(400);
  const panelOpen = await scope.locator('[data-minimap-panel]').getAttribute('data-open');
  const panelVisible = await scope.locator('[data-minimap-panel]').isVisible();
  check(
    'minimap: hovering the strip opens the list',
    panelOpen === 'true' && panelVisible,
    `open=${panelOpen} visible=${panelVisible}`,
  );

  /*
   * The list is the bars in words, so the two have to agree about where the
   * reader is. The markup ships the last entry lit — the app opens a session at
   * its newest message — and from then on it is `data-selected` and the CSS.
   */
  const litEntries = async () =>
    scope.evaluate((node) =>
      [...node.querySelectorAll('[data-minimap-entry]')]
        .map((entry, index) =>
          getComputedStyle(entry).backgroundColor === 'rgba(0, 0, 0, 0)' ? -1 : index,
        )
        .filter((index) => index >= 0),
    );
  check(
    'minimap: the list lights the entry the bars light',
    JSON.stringify(await litEntries()) === JSON.stringify([atBottom]),
    JSON.stringify(await litEntries()),
  );

  await scope.locator('[data-minimap-entry]').first().click();
  await page.waitForTimeout(800);
  /*
   * "Jumped to it" is the message at the top of the transcript, not scrollTop
   * near zero: the transcript starts with the session's own padding, so the first
   * message is already ~260px down the content.
   */
  const landed = await scope.evaluate((node) => {
    const scroller = node.querySelector('[data-minimap-scroll]');
    const message = scroller.querySelector('[data-message-index]');
    return Math.round(message.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  });
  check('minimap: clicking an entry jumps to that message', Math.abs(landed) <= 2, `${landed}px`);
  check(
    'minimap: the pick closes the list',
    (await scope.locator('[data-minimap-panel]').getAttribute('data-open')) === 'false',
    `open=${await scope.locator('[data-minimap-panel]').getAttribute('data-open')}`,
  );
  /*
   * The list and the bars answer the same question — where is the reader — and
   * after the jump they have to still agree. Which message counts as current near
   * a boundary is the app's centre rule; what matters here is that one list entry
   * is lit and it is the one the strip is lit at.
   */
  check(
    'minimap: the light follows the jump',
    JSON.stringify(await litEntries()) === JSON.stringify([await litIndex()]),
    JSON.stringify({ entries: await litEntries(), bar: await litIndex() }),
  );
  await page.emulateMedia({ reducedMotion: null });
}

// --- session tree -----------------------------------------------------------
{
  await showStep(4);
  const tree = page.locator('[data-tree]');
  const rails = () =>
    tree
      .locator('[data-tree-rails] > span')
      .evaluateAll((spans) => spans.map((span) => span.style.height));

  // Off the tree first: a pointer left on it would already be the resting state.
  await page.mouse.move(4, 4);
  await page.waitForTimeout(200);
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

  /*
   * The preview is a card of the row under the pointer, so it has to be drawn
   * (`data-open` alone used to change nothing, and the card stayed at
   * `opacity: 0` for the whole life of the page) and it has to carry that row's
   * time — it shipped the first row's and never moved.
   */
  const preview = await tree.evaluate((node) => {
    const card = node.querySelector('[data-tree-preview]');
    const time = card.querySelector('[data-tree-preview-time]');
    const row = node.querySelector('[data-row-id="u5"]');
    return {
      open: card.dataset.open,
      opacity: getComputedStyle(card).opacity,
      time: time.textContent.trim(),
      rowTime: row.querySelector('[data-tree-row-time]').textContent.trim(),
      body: card.querySelector('[data-tree-preview-body]').textContent.trim().length,
    };
  });
  check(
    'session tree: hovering opens the preview, drawn and about that row',
    preview.open === 'true' &&
      preview.opacity === '1' &&
      preview.body > 0 &&
      preview.time === preview.rowTime,
    JSON.stringify(preview),
  );

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
  await showStep(5);
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

  const announced = await switcher.evaluate((node) => {
    const input = node.querySelector('[data-switcher-input]');
    const selected = [...node.querySelectorAll('[data-switcher-row]')].filter(
      (row) => row.getAttribute('aria-selected') === 'true',
    );
    return {
      selected: selected.map((row) => row.dataset.title),
      activeDescendant: input.getAttribute('aria-activedescendant'),
      describesSelected: document.getElementById(input.getAttribute('aria-activedescendant') ?? '')
        ?.dataset.title,
      role: input.getAttribute('role'),
      expanded: input.getAttribute('aria-expanded'),
    };
  });
  check(
    'switcher: the selection the arrow key made is the one announced',
    JSON.stringify(announced.selected) === JSON.stringify(['Minimap widths while resizing']) &&
      announced.role === 'combobox' &&
      announced.expanded === 'true' &&
      announced.describesSelected === announced.selected[0],
    JSON.stringify(announced),
  );

  await switcher.locator('[data-switcher-input]').press('Enter');
  const taken = await switcher.getAttribute('data-selected-title');
  check(
    'switcher: enter takes the row it points at',
    taken === 'Minimap widths while resizing',
    String(taken),
  );

  await switcher.locator('[data-switcher-input]').press('Escape');
  const reset = await visibleRows();
  check('switcher: escape clears the query', reset === 9, `visible=${reset}`);
}

// --- the tree's explanation -------------------------------------------------
{
  /*
   * The `?` is the only control that opens the dialog, so it has to be reachable
   * and the dialog has to behave like one: focus moves in, Escape closes it and
   * hands focus back to the button it came from.
   */
  await showStep(4);
  const toggle = page.locator('[data-tree-help-toggle]');
  const dialog = page.locator('[data-tree-help]');
  await toggle.click();
  await page.waitForTimeout(200);
  const opened = await dialog.evaluate((node) => ({
    state: node.dataset.state,
    focused: document.activeElement === node,
  }));
  check(
    'tree help: the `?` opens the dialog and focus moves into it',
    opened.state === 'open' && opened.focused,
    JSON.stringify(opened),
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => ({
    state: document.querySelector('[data-tree-help]').dataset.state,
    onToggle: document.activeElement?.matches('[data-tree-help-toggle]') ?? false,
    expanded: document.activeElement?.getAttribute('aria-expanded'),
  }));
  check(
    'tree help: Escape closes it and puts focus back on the `?`',
    closed.state === 'closed' && closed.onToggle && closed.expanded === 'false',
    JSON.stringify(closed),
  );
}

// --- structure --------------------------------------------------------------
{
  /*
   * One main region a page: the windows are pictures of an app that has its own,
   * and eleven landmarks would tell a screen reader nothing about this page.
   */
  const structure = await page.evaluate(() => ({
    mains: document.querySelectorAll('main').length,
    inWindows: document.querySelectorAll('[data-window-canvas] main').length,
    features: document.querySelector('header nav a')?.getAttribute('href'),
    githubName: document.querySelector('header a[aria-label="GitHub"]') !== null,
  }));
  check(
    'structure: the page has one main region, and the windows have none',
    structure.mains === 1 && structure.inWindows === 0,
    JSON.stringify(structure),
  );
  check(
    'structure: Features works from any page, and the GitHub link has a name',
    structure.features === '/#features' && structure.githubName,
    JSON.stringify({ features: structure.features, githubName: structure.githubName }),
  );

  const notFound = await readFile(join(ROOT, '404.html'), 'utf8');
  check(
    'structure: the 404 names no canonical URL and asks not to be indexed',
    !notFound.includes('rel="canonical"') && notFound.includes('name="robots" content="noindex"'),
    `canonical=${notFound.includes('rel="canonical"')} noindex=${notFound.includes('name="robots" content="noindex"')}`,
  );
  await showStep(0);
}

// --- terminal ---------------------------------------------------------------
{
  await showStep(6);
  const tabs = page.locator('[data-terminal-tab]');
  await tabs.nth(1).click();
  const state = await tabs.evaluateAll((nodes) =>
    nodes.map((node) => ({
      tab: node.dataset.terminalTab,
      // The app's own attribute for it: Radix writes `data-state=active`, and the
      // tab's classes read it.
      active: String(node.dataset.state === 'active'),
    })),
  );
  check(
    'terminal: clicking a tab activates it and only it',
    state[1].active === 'true' && state[0].active === 'false',
    JSON.stringify(state),
  );
}

// --- download ---------------------------------------------------------------
{
  /*
   * Every button on the page, not the first one: the header carries the download
   * now, and if a second one is ever added beside the hero a link that only
   * rewrote one of them is the bug this catches.
   */
  const links = await page.locator('[data-download-link]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href'),
      version: node.dataset.umamiEventVersion,
      asset: node.dataset.umamiEventAsset,
    })),
  );

  check(
    'download: every button points at the newest DMG',
    links.length > 0 && links.every((link) => link.href === CANDIDATE_DOWNLOAD_URL),
    JSON.stringify(links.map((link) => link.href)),
  );
  check(
    'download: the tracked event carries the resolved version and asset',
    links.every((link) => link.version === CANDIDATE_VERSION && link.asset === CANDIDATE_ASSET),
    JSON.stringify(links),
  );

  // The page's primary action sits under the title, and says which Mac it is for.
  const hero = await page.evaluate(() => {
    const button = document.querySelector('main > section a[data-download-link]');
    return button === null
      ? null
      : {
          label: button.textContent.replace(/\s+/g, ' ').trim(),
          href: button.getAttribute('href'),
        };
  });
  check(
    'download: the hero carries the primary button, for Apple Silicon',
    hero !== null &&
      hero.label === 'Download for Apple Silicon' &&
      hero.href === CANDIDATE_DOWNLOAD_URL,
    JSON.stringify(hero),
  );
}

// --- a window scaled twice ---------------------------------------------
{
  /*
   * A window that has been scaled once and then has to be scaled again.
   *
   * `initWindowFits` reads the window's height to reserve the room its picture
   * takes. Read as a rect on a page that is already wide, the tour's stills hand
   * back the height their stage has shrunk them to — 677 for an 800px window —
   * and the next scale shrinks that a second time, so the page reserves 341 where
   * the window draws 402 and the next section starts on top of it. Only a window
   * at its natural size is measured correctly, which is why a page loaded narrow
   * (the block below) looks fine and a page narrowed from a desktop does not.
   */
  const resized = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await stubReleaseApi(resized);
  await resized.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await resized.setViewportSize({ width: 390, height: 844 });
  await resized.waitForTimeout(600);
  const fits = await resized.evaluate(() =>
    [...document.querySelectorAll('[data-window-fit]')].map((fit) => ({
      reserved: Math.round(fit.getBoundingClientRect().height),
      drawn: Math.round(fit.querySelector('[data-window-canvas]').getBoundingClientRect().height),
    })),
  );
  const worstReserve = fits.reduce(
    (worst, fit) => Math.max(worst, Math.abs(fit.reserved - fit.drawn)),
    0,
  );
  check(
    'fit: a window narrowed after a wide load still reserves what it draws',
    fits.length > 0 && worstReserve <= 2,
    `worst ${worstReserve}px over ${fits.length} windows`,
  );
  await resized.close();
}

// --- no script --------------------------------------------------------------
{
  /*
   * The tour without the script, on a phone.
   *
   * Every chapter ships visible, and the one attribute `initFeatureStage` writes
   * is what stacks them in a single cell below `lg`. With no script nothing
   * writes it, so all seven read as an article — which is what the component
   * promises, and what seven headings in one cell would break.
   */
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  });
  const stillPage = await context.newPage();
  await stillPage.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  const withoutScript = await stillPage.evaluate(() => ({
    tops: [...document.querySelectorAll('[data-stage-copy]')].map((panel) =>
      Math.round(panel.getBoundingClientRect().top),
    ),
    stills: [...document.querySelectorAll('[data-stage-layer]')].filter(
      (layer) => getComputedStyle(layer).visibility !== 'hidden',
    ).length,
  }));
  check(
    'tour: without the script the chapters are an article, not one cell',
    withoutScript.tops.length === 7 &&
      new Set(withoutScript.tops).size === withoutScript.tops.length,
    JSON.stringify(withoutScript.tops),
  );
  check(
    'tour: without the script one still is drawn, not seven',
    withoutScript.stills === 1,
    `stills=${withoutScript.stills}`,
  );
  await context.close();
}

// --- narrow viewports -------------------------------------------------------
{
  /*
   * The same page on a phone. Nothing here is an interaction — it is the shape
   * the page promises at a width the app itself cannot go to: a window drawn at
   * the app's minimum and scaled, overlays that stay inside it, and no sideways
   * scroll anywhere.
   */
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await stubReleaseApi(phone);
  await phone.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

  const measured = await phone.evaluate(() => {
    const round = (value) => Math.round(value);
    const windows = [...document.querySelectorAll('[data-window-fit]')].map((fit) => {
      const canvas = fit.querySelector('[data-window-canvas]');
      const window_ = canvas.firstElementChild;
      const fitBox = fit.getBoundingClientRect();
      const windowBox = window_.getBoundingClientRect();
      // Everything inside the canvas is drawn full size and then scaled, so the
      // drawn geometry is the rendered one divided back out by that scale.
      const scale = windowBox.width / 680;
      const sidebar = window_.querySelector('aside');
      return {
        canvasWidth: canvas.style.width,
        fitWidth: round(fitBox.width),
        fitHeight: round(fitBox.height),
        windowWidth: round(windowBox.width / scale),
        windowHeight: round(windowBox.height / scale),
        scale: Number(scale.toFixed(3)),
        sidebarWidth: round(sidebar.getBoundingClientRect().width / scale),
        dialogsOutside: [...window_.querySelectorAll('[role="dialog"]')]
          .map((dialog) => dialog.getBoundingClientRect())
          .filter(
            (box) =>
              box.left < windowBox.left - 1 ||
              box.right > windowBox.right + 1 ||
              box.top < windowBox.top - 1 ||
              box.bottom > windowBox.bottom + 1,
          ).length,
      };
    });
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      windows,
    };
  });

  const { windows } = measured;
  check(
    'phone: the page never scrolls sideways',
    measured.overflow === 0,
    `overflow ${measured.overflow}px`,
  );
  check(
    "phone: every window is the app's 680px minimum, scaled to the column",
    windows.length > 0 &&
      windows.every(
        (window_) =>
          window_.canvasWidth === '680px' &&
          window_.windowWidth === 680 &&
          window_.scale > 0.4 &&
          window_.scale < 0.6,
      ),
    JSON.stringify(windows.map((window_) => [window_.canvasWidth, window_.scale])),
  );
  check(
    'phone: the canvas keeps the app 800px tall',
    windows.every((window_) => window_.windowHeight === 800),
    JSON.stringify(windows.map((window_) => window_.windowHeight)),
  );
  check(
    'phone: the wrapper reserves the scaled height, not the app height',
    windows.every((window_) => Math.abs(window_.fitHeight - Math.round(800 * window_.scale)) <= 2),
    JSON.stringify(windows.map((window_) => [window_.fitHeight, window_.scale])),
  );
  check(
    'phone: the sidebar is drawn in every window',
    windows.every((window_) => window_.sidebarWidth === 244),
    JSON.stringify(windows.map((window_) => window_.sidebarWidth)),
  );
  check(
    'phone: no dialog leaves the window it belongs to',
    windows.every((window_) => window_.dialogsOutside === 0),
    JSON.stringify(windows.map((window_) => window_.dialogsOutside)),
  );

  // Below `lg` there is no room to pin the window beside the words: the index is
  // the control, and it shows one chapter over one still.
  await phone.evaluate(() => document.querySelectorAll('[data-stage-chip]')[2].click());
  await phone.waitForTimeout(400);
  const phoneTour = await phone.evaluate(() => ({
    chapters: [...document.querySelectorAll('[data-stage-copy]')]
      .map((panel, index) => [index, getComputedStyle(panel).visibility !== 'hidden'])
      .filter(([, shown]) => shown)
      .map(([index]) => index),
    still: [...document.querySelectorAll('[data-stage-layer]')].findIndex(
      (layer) => layer.dataset.active === 'true',
    ),
  }));
  check(
    'tour: on a phone the index shows one chapter over one window',
    JSON.stringify(phoneTour) === JSON.stringify({ chapters: [2], still: 2 }),
    JSON.stringify(phoneTour),
  );

  const tablet = await browser.newPage({ viewport: { width: 768, height: 900 } });
  await stubReleaseApi(tablet);
  await tablet.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  const unscaled = await tablet.evaluate(() => {
    const fit = document.querySelector('[data-window-fit]');
    return {
      width: Math.round(fit.querySelector('[data-window-canvas]').getBoundingClientRect().width),
      transform: getComputedStyle(fit.querySelector('[data-window-canvas]')).transform,
    };
  });
  check(
    'tablet: the window is fluid above the app minimum, not scaled',
    unscaled.transform === 'none' && unscaled.width > 680,
    JSON.stringify(unscaled),
  );

  await phone.close();
  await tablet.close();
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
