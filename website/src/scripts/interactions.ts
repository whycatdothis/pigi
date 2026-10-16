/**
 * The page's whole client-side script.
 *
 * The page is static HTML; these are the six places where it is not. Everything
 * here is progressive: each initializer starts by looking for its own markup and
 * returns quietly when it is not on the page, so a component can be dropped
 * without touching this file — and if the script never loads, every one of these
 * components still renders, it just does not answer the pointer.
 *
 * One module rather than five `<script>` tags: the browser makes one request, and
 * the pieces that need to coordinate (three timers, two observers) can see each
 * other.
 *
 * Every initializer resolves its elements and then hands them to a `bind…`
 * function that takes them as parameters. A closure cannot see a narrowing done
 * by its caller, and the values here are narrowed out of `querySelector` results,
 * so passing them in is what keeps the lookups honest without assertions.
 */
import {
  RAIL_COLOR,
  RAIL_COLOR_CURRENT,
  RAIL_WIDTH_PX,
  RAIL_SPAN_CLASS,
  collectRailSpans,
  isRailOwner,
  railLeftPx,
  type TreeRowShape,
} from '../lib/treeGeometry';
import { LATEST_RELEASE_API, MAC_DMG_PATTERN } from '../lib/site';
import { getLineWidth, measureMaxLineWidth } from '../lib/minimapGeometry';

// ---------------------------------------------------------------------------
// Window fit
// ---------------------------------------------------------------------------

/**
 * Scales a window to fit when the viewport is narrower than the app can be.
 *
 * The app's smallest window is 680x800 (`createMainWindow.ts`), and that is what
 * each window on this page is drawn at once the room for it drops below 680 — a
 * fixed canvas, then this `scale`, then a wrapper height of the scaled height, so
 * the page reserves the room the picture actually takes rather than the canvas's
 * full 800px.
 *
 * Above that the canvas is simply the page's own width and nothing here does
 * anything: the window is fluid from 680 up to its 1200 maximum.
 */
function initWindowFits(): void {
  for (const fit of document.querySelectorAll<HTMLElement>('[data-window-fit]')) {
    const canvas = fit.querySelector<HTMLElement>('[data-window-canvas]');
    const window_ = canvas?.firstElementChild;
    const minWidth = Number(fit.dataset.windowFit);
    if (!canvas || !window_ || !Number.isFinite(minWidth) || minWidth <= 0) continue;

    // The canvas's own height, read once: the window's height is fixed.
    const canvasHeight = window_.getBoundingClientRect().height;
    let appliedScale = 0;

    const measure = (): void => {
      const available = fit.clientWidth;
      const scale = Math.min(1, available / minWidth);
      // The observer fires on the height this writes, which does not change the
      // width it reads; comparing the scale is what stops a second pass.
      if (Math.abs(scale - appliedScale) < 0.001) return;
      appliedScale = scale;

      canvas.style.width = scale < 1 ? `${minWidth}px` : '';
      canvas.style.transform = scale < 1 ? `scale(${scale})` : '';
      fit.style.height = scale < 1 ? `${canvasHeight * scale}px` : '';
    };

    measure();
    new ResizeObserver(measure).observe(fit);
  }
}

// ---------------------------------------------------------------------------
// View modes
// ---------------------------------------------------------------------------

/**
 * The menu in the toolbar, and the three ways it can draw a turn.
 *
 * The menu is a menu: it opens from the filter button, one item is checked, and
 * picking one closes it and switches the window. Which panel of the transcript is
 * visible is decided entirely by CSS off `data-active` on the window, so choosing
 * a mode is one attribute write and no re-render.
 *
 * Built here rather than with `<details>` because the app's menu is a popover with
 * a checked radio item — and because the checked state has to survive a click that
 * does not immediately close the menu.
 */
function initViewModes(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-view-modes]')) {
    const trigger = root.querySelector<HTMLElement>('[data-view-menu-trigger]');
    const menu = root.querySelector<HTMLElement>('[data-view-mode-menu]');
    if (trigger === null || menu === null) continue;

    const buttons = Array.from(menu.querySelectorAll<HTMLElement>('[data-view-mode-button]'));

    const setOpen = (open: boolean): void => {
      menu.dataset.open = String(open);
      trigger.setAttribute('aria-expanded', String(open));
    };

    const close = (): void => setOpen(false);

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(menu.dataset.open !== 'true');
    });

    for (const button of buttons) {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const mode = button.dataset.viewModeButton;
        if (mode === undefined) return;

        root.dataset.active = mode;
        for (const other of buttons) {
          const state = other === button ? 'checked' : 'unchecked';
          // `data-state` rather than an attribute of this page's own: it is what
          // Radix writes in the app, and what the app's own menu styles off
          // (`data-[state=checked]:...` in SessionToolbar.tsx).
          other.dataset.state = state;
          other.setAttribute('aria-checked', String(other === button));
        }
        close();
      });
    }

    // Clicking anywhere else, or pressing Escape, dismisses it — both of which a
    // menu is expected to do, and neither of which a still of one can show.
    document.addEventListener('click', () => {
      if (menu.dataset.open === 'true') close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.dataset.open === 'true') close();
    });
  }
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 300;

/**
 * The strip of bars in the corner of a transcript.
 *
 * Both halves: the bars track the scroll position, and the list opens on hover so
 * a reader can see where they are about to jump. Each bar answers a click by
 * scrolling that message to the top, which is the whole feature.
 *
 * The lit bar is the message closest to the centre of the viewport, which is what
 * the app derives in `useActiveUserMessageIndex` — centre rather than top so that
 * scrolling to the end leaves the last message lit instead of the one before it.
 */
function initMinimaps(): void {
  for (const scope of document.querySelectorAll<HTMLElement>('[data-minimap-scope]')) {
    const scroller = scope.querySelector<HTMLElement>('[data-minimap-scroll]');
    const strip = scope.querySelector<HTMLElement>('[data-minimap]');
    const panel = scope.querySelector<HTMLElement>('[data-minimap-panel]');
    if (!scroller || !strip || !panel) continue;
    bindMinimap(scroller, strip, panel);
  }
}

function bindMinimap(scroller: HTMLElement, strip: HTMLElement, panel: HTMLElement): void {
  const bars = Array.from(strip.querySelectorAll<HTMLElement>('[data-minimap-bar]'));
  const entries = Array.from(panel.querySelectorAll<HTMLElement>('[data-minimap-entry]'));
  const messages = Array.from(scroller.querySelectorAll<HTMLElement>('[data-message-index]'));
  // One bar per message, and one entry per bar: anything else means the markup no
  // longer matches this script, and guessing which is which would be worse than
  // leaving the strip inert.
  if (bars.length === 0 || bars.length !== entries.length || bars.length !== messages.length) {
    return;
  }

  let activeIndex = -1;
  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  let frame = 0;

  /**
   * The bars are as wide as the room beside the transcript allows, which is the
   * app's own rule (`UserMessageMiniMap.tsx`) and the reason a bar never reaches
   * into the text: under the app's 860px column the strip shrinks to the page's
   * inline padding. Built at the app's default-window width; re-measured here
   * because this window answers the viewport.
   */
  function sizeBars(): void {
    const maxLineWidth = measureMaxLineWidth(scroller.clientWidth);
    bars.forEach((bar, index) => {
      bar.style.width = `${getLineWidth(index, bars.length, maxLineWidth)}px`;
    });
  }

  function setActive(nextIndex: number): void {
    if (nextIndex === activeIndex) return;
    activeIndex = nextIndex;

    bars.forEach((bar, index) => {
      bar.style.backgroundColor =
        index === activeIndex
          ? 'var(--system-accent)'
          : 'color-mix(in srgb, var(--muted-foreground) 50%, transparent)';
    });
    entries.forEach((entry, index) => {
      entry.dataset.selected = String(index === activeIndex);
    });
  }

  function scrollToIndex(index: number): void {
    messages[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateFromScroll(): void {
    const viewportCentre = scroller.scrollTop + scroller.clientHeight / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < messages.length; index += 1) {
      const centre = messages[index].offsetTop + messages[index].offsetHeight / 2;
      const distance = Math.abs(centre - viewportCentre);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }

    setActive(closestIndex);
  }

  function openPanel(): void {
    window.clearTimeout(closeTimer);
    openTimer = window.setTimeout(() => {
      panel.dataset.open = 'true';
    }, HOVER_OPEN_DELAY_MS);
  }

  function closePanel(): void {
    window.clearTimeout(openTimer);
    closeTimer = window.setTimeout(() => {
      panel.dataset.open = 'false';
    }, HOVER_CLOSE_DELAY_MS);
  }

  for (const target of [strip, panel]) {
    target.addEventListener('mouseenter', openPanel);
    target.addEventListener('mouseleave', closePanel);
  }

  for (const control of [...bars, ...entries]) {
    control.addEventListener('click', () => {
      const index = Number(control.dataset.target);
      if (Number.isFinite(index)) scrollToIndex(index);
    });
  }

  sizeBars();
  new ResizeObserver(sizeBars).observe(scroller);

  // Throttled to one pass per frame: a scroll burst costs one layout read per
  // frame rather than one per event, which is what the app does too.
  scroller.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateFromScroll);
    },
    { passive: true },
  );
  updateFromScroll();
}

// ---------------------------------------------------------------------------
// Session tree
// ---------------------------------------------------------------------------

/** How long the pointer has to rest on a row before the preview opens. */
const PREVIEW_OPEN_DELAY_MS = 260;

interface TreeRowInfo extends TreeRowShape {
  id: string;
  onPath: boolean;
  element: HTMLElement;
}

/**
 * The session tree's branch lines.
 *
 * The lines are drawn once at build time for the row the session is on. From then
 * on the pointer decides where they run: resting on a row lights the way back to
 * it, which is how the app answers the question "what does jumping here leave
 * behind?" before you jump. Clicking moves the session, and the marker follows.
 *
 * The geometry — where a fork starts, where it ends, where the light stops — is
 * the same module the rows were laid out with, so the lines cannot drift from the
 * rows they describe.
 */
function initSessionTrees(): void {
  for (const tree of document.querySelectorAll<HTMLElement>('[data-tree]')) {
    const rails = tree.querySelector<HTMLElement>('[data-tree-rails]');
    const rows = Array.from(tree.querySelectorAll<HTMLElement>('[data-tree-row]'));
    if (!rails || rows.length === 0) continue;
    bindSessionTree(tree, rails, rows);
  }
}

function bindSessionTree(tree: HTMLElement, rails: HTMLElement, rows: HTMLElement[]): void {
  const preview = tree.querySelector<HTMLElement>('[data-tree-preview]');

  const rowInfos: TreeRowInfo[] = rows.map((element) => ({
    id: element.dataset.rowId ?? '',
    depth: Number(element.dataset.depth ?? 0),
    isBranchChild: element.dataset.branchChild === 'true',
    onPath: element.dataset.onPath === 'true',
    element,
  }));

  /** Which row at each depth the active path goes through. */
  const pathOwners = new Map<number, string>();
  for (const row of rowInfos) {
    if (row.onPath) pathOwners.set(row.depth, row.id);
  }

  /** The row the session is on: the last one of the path, in reading order. */
  const restingRowId = [...rowInfos].reverse().find((row) => row.onPath)?.id ?? rowInfos[0].id;

  const elbows = new Map<string, HTMLElement>();
  for (const elbow of tree.querySelectorAll<HTMLElement>('[data-tree-elbow]')) {
    elbows.set(elbow.dataset.treeElbow ?? '', elbow);
  }

  function paint(litRowId: string): void {
    const spans = collectRailSpans(
      rowInfos,
      rowInfos.map((row) => row.id),
      pathOwners,
      litRowId,
    );

    rails.replaceChildren(
      ...spans.map((span) => {
        const litHeight =
          span.litEndPx === null ? span.endPx - span.topPx : span.litEndPx - span.topPx;
        const line = document.createElement('span');
        line.className = RAIL_SPAN_CLASS;
        line.style.left = `${railLeftPx(span.forkDepth)}px`;
        line.style.top = `${span.topPx}px`;
        line.style.width = `${RAIL_WIDTH_PX}px`;
        line.style.height = `${litHeight}px`;
        line.style.background = span.litEndPx === null ? RAIL_COLOR : RAIL_COLOR_CURRENT;
        return line;
      }),
    );

    for (const row of rowInfos) {
      const elbow = elbows.get(row.id);
      if (!elbow) continue;
      elbow.style.background = isRailOwner(row, row.id, pathOwners)
        ? RAIL_COLOR_CURRENT
        : RAIL_COLOR;
    }
  }

  function setCurrent(rowId: string): void {
    for (const row of rowInfos) {
      row.element.dataset.current = String(row.id === rowId);
    }
  }

  let previewTimer: number | undefined;

  function hidePreview(): void {
    window.clearTimeout(previewTimer);
    if (preview) preview.dataset.open = 'false';
  }

  for (const row of rowInfos) {
    row.element.addEventListener('mouseenter', () => {
      paint(row.id);
      if (!preview) return;

      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        const body = preview.querySelector<HTMLElement>('[data-tree-preview-body]');
        if (body) body.textContent = row.element.dataset.preview ?? '';
        preview.style.top = `${row.element.parentElement?.offsetTop ?? 0}px`;
        preview.dataset.open = 'true';
      }, PREVIEW_OPEN_DELAY_MS);
    });

    row.element.addEventListener('click', () => {
      setCurrent(row.id);
      hidePreview();
    });
  }

  tree.addEventListener('mouseleave', () => {
    hidePreview();
    paint(restingRowId);
  });
}

// ---------------------------------------------------------------------------
// Session switcher
// ---------------------------------------------------------------------------

/**
 * The `Ctrl+R` palette's filter.
 *
 * Subsequence matching, the same thing the app does: typing `mmw` finds
 * "Minimap widths while resizing" because those letters appear in that order, and
 * the letters that matched are marked so the reader can see why a row is in the
 * list. Characters are inserted as text nodes, never as markup.
 *
 * Enter and click close the palette; the session behind it is a still, so there is
 * nothing to switch to. The demo stops where the page's recreated session stops.
 */
function initSessionSwitcher(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-session-switcher]')) {
    const input = root.querySelector<HTMLInputElement>('[data-switcher-input]');
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-switcher-row]'));
    if (!input || rows.length === 0) continue;
    bindSessionSwitcher(root, input, rows);
  }
}

function bindSessionSwitcher(
  root: HTMLElement,
  input: HTMLInputElement,
  rows: HTMLElement[],
): void {
  const empty = root.querySelector<HTMLElement>('[data-switcher-empty]');

  function renderTitle(target: HTMLElement, text: string, indexes: number[]): void {
    const fragment = document.createDocumentFragment();
    const matched = new Set(indexes);
    let run: string | null = null;

    const flush = (): void => {
      if (run === null) return;
      const mark = document.createElement('mark');
      mark.className = 'rounded-sm bg-[var(--system-accent)]/20 text-inherit';
      mark.textContent = run;
      fragment.append(mark);
      run = null;
    };

    for (let index = 0; index < text.length; index += 1) {
      if (matched.has(index)) {
        run = (run ?? '') + text[index];
        continue;
      }
      flush();
      fragment.append(document.createTextNode(text[index]));
    }
    flush();
    target.replaceChildren(fragment);
  }

  function selectRow(selected: HTMLElement | null): void {
    for (const row of rows) {
      row.dataset.selected = String(row === selected);
    }
  }

  function applyFilter(): void {
    const query = input.value.trim().toLowerCase();
    let visibleCount = 0;
    let firstVisible: HTMLElement | null = null;

    for (const row of rows) {
      const title = row.dataset.title ?? '';
      const indexes = fuzzyMatchIndexes(title, query);
      const titleElement = row.querySelector<HTMLElement>('[data-switcher-title]');

      if (indexes === null) {
        row.hidden = true;
        continue;
      }

      row.hidden = false;
      visibleCount += 1;
      firstVisible ??= row;
      if (titleElement) renderTitle(titleElement, title, query.length === 0 ? [] : indexes);
    }

    if (empty) empty.hidden = visibleCount > 0;

    const selected = rows.find((row) => !row.hidden && row.dataset.selected === 'true');
    selectRow(selected ?? firstVisible);
  }

  input.addEventListener('input', applyFilter);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      if (event.key === 'Escape') {
        input.value = '';
        applyFilter();
      }
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const visible = rows.filter((row) => !row.hidden);
    if (visible.length === 0) return;
    const current = visible.findIndex((row) => row.dataset.selected === 'true');
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = visible[(current + step + visible.length) % visible.length];
    selectRow(next);
    next.scrollIntoView({ block: 'nearest' });
  });

  applyFilter();
}

/**
 * Where the letters of `query` appear in `text`, in order, or null when they do
 * not. An empty query matches everything with nothing to mark, which is what
 * makes `applyFilter` also the "reset the list" path.
 */
function fuzzyMatchIndexes(text: string, query: string): number[] | null {
  if (query.length === 0) return [];
  const haystack = text.toLowerCase();
  const indexes: number[] = [];
  let queryIndex = 0;

  for (let index = 0; index < haystack.length && queryIndex < query.length; index += 1) {
    if (haystack[index] === query[queryIndex]) {
      indexes.push(index);
      queryIndex += 1;
    }
  }

  return queryIndex === query.length ? indexes : null;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

const RELEASE_CACHE_KEY = 'pigi:latest-release';
const RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedRelease {
  url: string;
  version: string;
  asset: string;
  size: number;
  cachedAt: number;
}

interface GithubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets?: GithubAsset[];
}

/**
 * Points the download buttons at the actual DMG.
 *
 * The markup ships a link to `/releases/latest`, which GitHub redirects to the
 * newest release — correct, but it lands the reader on a web page instead of
 * starting the download. This asks the API which file the newest release holds
 * and rewrites the link to the file itself, so the button is one click.
 *
 * It is a network call, so it is allowed to fail: on any error the fallback the
 * markup shipped with stays exactly where it was, and the button still works.
 */
async function initDownload(): Promise<void> {
  const buttons = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-download-link]'));
  if (buttons.length === 0) return;

  const cached = readCachedRelease();
  if (cached) {
    applyRelease(cached);
    return;
  }

  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return;

    const release: GithubRelease = await response.json();
    const asset = release.assets?.find((candidate) => MAC_DMG_PATTERN.test(candidate.name));
    if (!asset) return;

    const resolved: CachedRelease = {
      url: asset.browser_download_url,
      version: release.tag_name,
      asset: asset.name,
      size: asset.size,
      cachedAt: Date.now(),
    };
    applyRelease(resolved);
    writeCachedRelease(resolved);
  } catch {
    // Offline, rate-limited, or the API changed shape: the fallback stands.
  }

  function applyRelease(release: CachedRelease): void {
    for (const button of buttons) {
      button.href = release.url;
      // Umami reads these off the element when the click happens, so the
      // recorded event carries the version that was actually served.
      button.dataset.umamiEventVersion = release.version;
      button.dataset.umamiEventAsset = release.asset;
    }
  }
}

function readCachedRelease(): CachedRelease | null {
  try {
    const raw = sessionStorage.getItem(RELEASE_CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedRelease = JSON.parse(raw);
    if (Date.now() - parsed.cachedAt > RELEASE_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedRelease(release: CachedRelease): void {
  try {
    sessionStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify(release));
  } catch {
    // Private mode, or a full quota: the button already works without the cache.
  }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * Light or dark, remembered.
 *
 * The initial value is decided by the inline script in BaseLayout (before the
 * first paint); this only handles the click. `theme` is the key the app itself
 * uses, and the two values it stores are the same two this does — `system` is
 * the absence of an entry, which is what an untouched browser has.
 */
function initThemeToggle(): void {
  const button = document.querySelector<HTMLElement>('[data-theme-toggle]');
  if (button === null) return;

  button.addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // Private mode: the toggle still works for this page view.
    }
  });
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

/**
 * The panel's tabs.
 *
 * One active tab at a time, which is what the app's tab strip does — the panel
 * itself shows the same shell either way, since the shell behind it is a still.
 */
function initTerminalTabs(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-terminal-tabs]')) {
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('[data-terminal-tab]'));

    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const other of tabs) {
          // `data-state=active` is Radix's word for it in the app, and what the
          // tab's own classes style off.
          other.dataset.state = other === tab ? 'active' : 'inactive';
        }
      });
    }
  }
}

// ---------------------------------------------------------------------------

initThemeToggle();
initWindowFits();
initViewModes();
initMinimaps();
initSessionTrees();
initSessionSwitcher();
initTerminalTabs();
void initDownload();
