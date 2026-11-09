// Drives the built page in a real browser and asserts interactions and narrow-viewport layout.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

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

// The download href needs no API lookup; the download checks assert this stays empty.
const releaseApiRequests = [];
page.on('request', (request) => {
  if (request.url().startsWith('https://api.github.com/')) releaseApiRequests.push(request.url());
});

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

// Must match the chapter list in src/lib/features.ts.
const CHAPTER_COUNT = 13;
const ALL_CHAPTERS = Array.from({ length: CHAPTER_COUNT }, (_, index) => index);

const stepIndex = (id) =>
  page.evaluate(
    (chapterId) =>
      [...document.querySelectorAll('[data-stage-copy]')].findIndex(
        (panel) => panel.id === `stage-copy-${chapterId}`,
      ),
    id,
  );

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
}

// From `lg` up the tour is scroll-driven; below it the chip is the control.
async function showStep(index) {
  const outcome = await page.evaluate((position) => {
    const chapter = document.querySelectorAll('[data-stage-copy]')[position];
    const chip = document.querySelectorAll('[data-stage-chip]')[position];
    if (!(chapter instanceof HTMLElement)) return 'missing';
    // `checkVisibility`, not the chip's `display`: it is the parent row that gets hidden.
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

{
  // Tooltip content has `pointer-events: none`, so a `?` inside one could never be pressed
  // yet stayed in the tab order. The only `?` belongs in the tree dialog header.
  await showStep(await stepIndex('tree'));
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
    JSON.stringify(atLoad) === JSON.stringify({ chapters: ALL_CHAPTERS, stills: [0], current: 0 }),
    JSON.stringify(atLoad),
  );

  // The sticky rule breaks silently (grid `align-self`, a taller sibling).
  // Use a chapter whose still has no timer; scrolling past a cycling one would start it.
  const pinned = await page.evaluate(async () => {
    const settle = () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const chapter = document.getElementById('stage-copy-git');
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

  // If the scaler stays at the frame's width, the app lays out narrower and draws
  // smaller than its column.
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
    JSON.stringify(midTour) === JSON.stringify({ chapters: ALL_CHAPTERS, stills: [3], current: 3 }),
    JSON.stringify(midTour),
  );

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

  await showStep(await stepIndex('switch'));
  const cycleState = () =>
    page.evaluate(() => {
      const frames = [...document.querySelectorAll('[data-session-frame]')];
      const open = frames.findIndex((frame) => frame.dataset.active === 'true');
      const check = (frame) =>
        [...frame.querySelectorAll('[data-sidebar-row]')]
          .filter((row) => row.querySelector('[data-active]') !== null)
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

  // Pointer off the still (hover pauses it), then wait past one advance.
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

  const lists = await page.evaluate(() =>
    [...document.querySelectorAll('[data-window-fit]')].map((fit) => {
      const rows = [...fit.querySelectorAll('[data-sidebar-row]')];
      return {
        title: fit.querySelector('[data-window-title]').dataset.windowTitle,
        count: rows.length,
        selected: rows
          .filter((row) => row.querySelector('[data-active]') !== null)
          .map((row) => row.dataset.sidebarRow),
        forks: rows
          .filter((row) => row.querySelector('[data-lineage-depth]') !== null)
          .map((row) => row.dataset.sidebarRow),
      };
    }),
  );
  const withoutList = lists.filter((list) => list.count === 0).map((list) => list.title);
  check(
    'sidebar: only Files, Git and Settings draw a sidebar of their own',
    JSON.stringify(withoutList.toSorted()) ===
      JSON.stringify([
        'Appearance',
        'Copy file names from the Files tab',
        'Copy file names from the Files tab',
      ]),
    JSON.stringify(withoutList),
  );

  const packagesList = lists.find((list) => list.title === 'Packages');
  check(
    'sidebar: the Packages page selects no session',
    packagesList?.count === 3 && packagesList.selected.length === 0,
    JSON.stringify(packagesList),
  );

  const sessionLists = lists.filter((list) => list.count > 0 && list.title !== 'Packages');
  const isSubagentList = (list) => list.forks.some((title) => title.includes('subagents'));
  check(
    'sidebar: every session window lists three rows, its open session selected',
    sessionLists.length > 0 &&
      sessionLists.every(
        (list) =>
          list.count === (isSubagentList(list) ? 5 : 3) &&
          list.selected.length === 1 &&
          list.selected[0] === list.title,
      ),
    JSON.stringify(sessionLists.map((list) => [list.title, list.count, list.selected])),
  );

  // `- 3`: the switch still's three sessions have no fork.
  const forkLists = sessionLists.filter((list) => !isSubagentList(list));
  check(
    'sidebar: the fork is listed under the session it came from',
    forkLists.filter((list) => list.forks.length === 1).length === forkLists.length - 3,
    JSON.stringify(forkLists.map((list) => list.forks)),
  );
  const subagentList = sessionLists.find(isSubagentList);
  check(
    'sidebar: the subagents fold under their session, two of them',
    subagentList?.forks.length === 3,
    JSON.stringify(subagentList?.forks),
  );

  await showStep(0);
}

{
  // Hold the 1.5s cycle (reduced motion) so the checks are deterministic; cycling is
  // checked once below.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showStep(await stepIndex('views'));
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

  await page.emulateMedia({ reducedMotion: 'reduce' });

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
      // The app's menu styles off `data-state`, so assert on that.
      const checked = [...menu.querySelectorAll('[data-view-mode-button]')]
        .filter((button) => button.dataset.state === 'checked')
        .map((button) => button.dataset.viewModeButton);
      const selected = [...menu.querySelectorAll('[data-view-mode-button]')].filter(
        (button) => button.getAttribute('aria-checked') === 'true',
      );
      // Count drawn ticks, not markup: an icon present only on the initially active item
      // passed every attribute check.
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

  await chooseMode('minimal');
  const timer = page.locator('[data-minimal-timer]');
  await timer.click();
  // Wait out the chevron's rotate transition.
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

{
  await showStep(await stepIndex('tree'));
  const dialog = page.locator('[data-tree-help]');
  const closed = await dialog.getAttribute('data-state');
  const hidden = await dialog.isVisible();
  check(
    'tree help: it ships closed, the way the app is until the `?` is clicked',
    closed === 'closed' && !hidden,
    `state=${closed} visible=${hidden}`,
  );

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

{
  await showStep(await stepIndex('switch'));
  // Reduced motion holds the still on session 0, the long one the minimap is drawn for.
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

  // `scrollIntoView` also scrolled the page, which changed the tour chapter.
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

  // Pointer off the strip: hover opens the list, which covers the bars.
  await page.mouse.move(4, 4);
  await page.waitForTimeout(500);

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
  // The transcript has top padding, so measure the first message, not scrollTop.
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
  check(
    'minimap: the light follows the jump',
    JSON.stringify(await litEntries()) === JSON.stringify([await litIndex()]),
    JSON.stringify({ entries: await litEntries(), bar: await litIndex() }),
  );
  await page.emulateMedia({ reducedMotion: null });
}

{
  await showStep(await stepIndex('tree'));
  const tree = page.locator('[data-tree]');
  const rails = () =>
    tree
      .locator('[data-tree-rails] > span')
      .evaluateAll((spans) => spans.map((span) => span.style.height));

  await page.mouse.move(4, 4);
  await page.waitForTimeout(200);
  const restingRails = await rails();

  // u5 is on another branch, so lighting it must change the rails.
  await tree.locator('[data-row-id="u5"]').hover();
  await page.waitForTimeout(450);

  const hoveredRails = await rails();
  check(
    'session tree: hovering a row moves the light',
    JSON.stringify(restingRails) !== JSON.stringify(hoveredRails),
    `${JSON.stringify(restingRails)} -> ${JSON.stringify(hoveredRails)}`,
  );

  // Regressions: the card stayed at opacity 0, and kept the first row's time.
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

{
  await showStep(await stepIndex('switcher'));
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

{
  await showStep(await stepIndex('tree'));
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

{
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

  // The app prefixes a command with its tool name, `$` only for bash (toolDisplay.ts).
  const home = await readFile(join(ROOT, 'index.html'), 'utf8');
  const strayPrefixes = ['$ read', '$ edit', '$ write', '→'].filter((needle) =>
    home.includes(needle),
  );
  check(
    'tool cards: no command wears a prefix the app does not use',
    strayPrefixes.length === 0,
    JSON.stringify(strayPrefixes),
  );

  const notFound = await readFile(join(ROOT, '404.html'), 'utf8');
  check(
    'structure: the 404 names no canonical URL and asks not to be indexed',
    !notFound.includes('rel="canonical"') && notFound.includes('name="robots" content="noindex"'),
    `canonical=${notFound.includes('rel="canonical"')} noindex=${notFound.includes('name="robots" content="noindex"')}`,
  );
  await showStep(0);
}

{
  // Click via `evaluate`: Playwright's click scrolls the element into view, which moves
  // the pinned tour.
  const clickIn = (id, selector) =>
    page.evaluate(
      ([chapterId, target]) => {
        const chapters = [...document.querySelectorAll('[data-stage-copy]')];
        const index = chapters.findIndex((panel) => panel.id === `stage-copy-${chapterId}`);
        const layer = document.querySelectorAll('[data-stage-layer]')[index];
        const element = layer?.querySelector(target);
        if (!(element instanceof HTMLElement)) return false;
        element.click();
        return true;
      },
      [id, selector],
    );

  await showStep(await stepIndex('files'));
  await clickIn('files', '[data-file-view="source"]');
  const viewer = await page.evaluate(() => {
    const root = document.querySelector('[data-file-viewer]');
    const visible = (selector) => root.querySelector(selector)?.checkVisibility() ?? false;
    return {
      view: root.dataset.view,
      source: visible('[data-file-source]'),
      preview: visible('[data-file-preview]'),
      pressed: root.querySelector('[data-file-view="source"]').getAttribute('aria-pressed'),
    };
  });
  check(
    'files: Source swaps the rendered page for the highlighted file',
    viewer.view === 'source' && viewer.source && !viewer.preview && viewer.pressed === 'true',
    JSON.stringify(viewer),
  );

  const tokens = await page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll('[data-file-viewer] .code-token')].map(
          (token) => getComputedStyle(token).color,
        ),
      ).size,
  );
  check('files: the source is highlighted, more than one colour', tokens > 1, `colours=${tokens}`);

  await showStep(await stepIndex('quote'));
  const before = await page.evaluate(
    () => document.querySelector('[data-quote-list]').children.length,
  );
  await clickIn('quote', '[data-quote-button]');
  const quoted = await page.evaluate(() => ({
    cards: document.querySelector('[data-quote-list]').children.length,
    count: document.querySelector('[data-quote-count]').textContent.trim(),
    last: document.querySelector('[data-quote-list]').lastElementChild?.textContent ?? '',
    button: document.querySelector('[data-quote-button]') !== null,
  }));
  check(
    'quote: the Quote button adds the selection to the panel and counts it',
    quoted.cards === before + 1 &&
      quoted.count === String(before + 1) &&
      quoted.last.includes('as well as on hover') &&
      !quoted.button,
    JSON.stringify(quoted),
  );

  await showStep(await stepIndex('packages'));
  await clickIn('packages', '[data-packages-tab="marketplace"]');
  const packages = await page.evaluate(() => {
    const root = document.querySelector('[data-packages]');
    return {
      tab: root.dataset.tab,
      popular: [...root.querySelectorAll('h2')].some(
        (heading) => heading.textContent.trim() === 'Popular' && heading.checkVisibility(),
      ),
      selected: root.querySelector('[data-packages-tab="marketplace"]').dataset.state,
    };
  });
  check(
    'packages: the Marketplace tab shows the catalog',
    packages.tab === 'marketplace' && packages.popular && packages.selected === 'active',
    JSON.stringify(packages),
  );
  await showStep(0);
}

{
  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.reload({ waitUntil: 'networkidle' });
  await showStep(await stepIndex('appearance'));
  const appToken = (name) =>
    page.evaluate(
      (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
      name,
    );
  const clickInStill = (selector) =>
    page.evaluate((target) => {
      const element = document
        .querySelector('[data-mode-previews]')
        .closest('[data-window-canvas]')
        .querySelector(target);
      element.click();
    }, selector);

  const pinkPrimary = await appToken('--app-primary');
  const pageColours = () =>
    page.evaluate(() => ({
      page: getComputedStyle(document.body).backgroundColor,
      button: getComputedStyle(document.querySelector('[data-download-link]')).backgroundColor,
    }));
  const pinkPage = await pageColours();
  await clickInStill('[data-accent-option="blue"]');
  // The download button transitions to its new fill.
  await page.waitForTimeout(400);
  const accent = await page.evaluate(() => ({
    pressed: [...document.querySelectorAll('[data-accent-option][aria-pressed="true"]')].map(
      (option) => option.dataset.accentOption,
    ),
  }));
  const bluePrimary = await appToken('--app-primary');
  check(
    'appearance: an accent re-derives the page’s accent and moves the check',
    bluePrimary !== '' &&
      bluePrimary !== pinkPrimary &&
      JSON.stringify(accent.pressed) === '["blue"]',
    JSON.stringify({ pinkPrimary, bluePrimary, ...accent }),
  );
  const bluePage = await pageColours();
  check(
    'appearance: the accent re-colours the page and its download button too',
    bluePage.page !== pinkPage.page && bluePage.button !== pinkPage.button,
    JSON.stringify({ pinkPage, bluePage }),
  );

  await clickInStill('[data-theme-picker]');
  await clickInStill('[data-theme-option="nord"]');
  const nord = await page.evaluate(() => ({
    name: document.querySelector('[data-theme-name]').textContent.trim(),
    background: getComputedStyle(document.documentElement)
      .getPropertyValue('--app-background')
      .trim(),
    menu: document.querySelector('[data-theme-menu]').dataset.open,
  }));
  check(
    'appearance: a named theme re-skins the page and names itself',
    nord.name === 'Nord' && nord.background !== '' && nord.menu === 'false',
    JSON.stringify(nord),
  );

  await clickInStill('[data-theme-mode="dark"]');
  const dark = await page.evaluate(() => ({
    className: document.documentElement.className,
    stored: localStorage.getItem('theme'),
    checked: document.querySelector('[data-theme-mode][aria-checked="true"]')?.dataset.themeMode,
  }));
  check(
    'appearance: the Dark preview puts the whole page in dark mode, remembered',
    dark.className === 'dark' && dark.stored === 'dark' && dark.checked === 'dark',
    JSON.stringify(dark),
  );

  await clickInStill('[data-theme-mode="system"]');
  const system = await page.evaluate(() => localStorage.getItem('theme'));
  check(
    'appearance: System forgets the choice and follows the system',
    system === null,
    `${system}`,
  );

  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.reload({ waitUntil: 'networkidle' });
}

{
  await showStep(await stepIndex('terminal'));
  const tabs = page.locator('[data-terminal-tab]');
  await tabs.nth(1).click();
  const state = await tabs.evaluateAll((nodes) =>
    nodes.map((node) => ({
      tab: node.dataset.terminalTab,
      // Radix's `data-state` is what the tab's classes read.
      active: String(node.dataset.state === 'active'),
    })),
  );
  check(
    'terminal: clicking a tab activates it and only it',
    state[1].active === 'true' && state[0].active === 'false',
    JSON.stringify(state),
  );
}

{
  // Written out to assert the shipped shape: `latest/download`, no version, so a new
  // release needs no rebuild and visitors need no API lookup.
  const EXPECTED_DOWNLOAD_URL =
    'https://github.com/whycatdothis/pigi/releases/latest/download/pigi-arm64.dmg';

  const links = await page.locator('[data-download-link]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href'),
      event: node.dataset.umamiEvent ?? null,
    })),
  );

  check(
    'download: the page ships one button, pointing at the latest arm64 DMG',
    links.length === 1 && links.every((link) => link.href === EXPECTED_DOWNLOAD_URL),
    JSON.stringify(links.map((link) => link.href)),
  );
  check(
    'download: the header carries links, not a second download',
    (await page.locator('header [data-download-link]').count()) === 0,
    JSON.stringify(links),
  );
  check(
    'download: the click carries its event name in the markup',
    links.every((link) => link.event === 'download-release'),
    JSON.stringify(links.map((link) => link.event)),
  );
  check(
    'download: the page asks the releases API for nothing',
    releaseApiRequests.length === 0,
    JSON.stringify(releaseApiRequests),
  );

  const hero = await page.evaluate(() => {
    const button = document.querySelector('main > section a[data-download-link]');
    return button === null
      ? null
      : {
          label: button.textContent.replace(/\s+/g, ' ').trim(),
          href: button.getAttribute('href'),
          icons: button.querySelectorAll('svg').length,
        };
  });
  check(
    'download: the hero carries the primary button, for macOS',
    hero !== null &&
      hero.label === 'Download for macOS' &&
      hero.icons === 1 &&
      hero.href === EXPECTED_DOWNLOAD_URL,
    JSON.stringify(hero),
  );
}

{
  // Regression: after a wide load, initWindowFits measured the already-scaled rect and
  // scaled it again, reserving 341px for a 402px window.
  const resized = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

{
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
    withoutScript.tops.length === CHAPTER_COUNT &&
      new Set(withoutScript.tops).size === withoutScript.tops.length,
    JSON.stringify(withoutScript.tops),
  );
  check(
    'tour: without the script one still is drawn, not all of them',
    withoutScript.stills === 1,
    `stills=${withoutScript.stills}`,
  );
  await context.close();
}

{
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

  const measured = await phone.evaluate(() => {
    const round = (value) => Math.round(value);
    const windows = [...document.querySelectorAll('[data-window-fit]')].map((fit) => {
      const canvas = fit.querySelector('[data-window-canvas]');
      const window_ = canvas.firstElementChild;
      const fitBox = fit.getBoundingClientRect();
      const windowBox = window_.getBoundingClientRect();
      // 680 is the app's minimum width; divide the scale out to get drawn sizes.
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
