/**
 * The page's whole client-side script.
 *
 * The page is static HTML; these are the places where it is not. Everything
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
import { WINDOW_HEIGHT_PX, WINDOW_WIDTH_PX } from '../lib/appLayout';
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
    if (!(window_ instanceof HTMLElement) || !canvas || !Number.isFinite(minWidth) || minWidth <= 0)
      continue;

    /*
     * The window's height in layout pixels, read once: the window's height is
     * fixed, so it only has to be read once — but it has to be read as a height,
     * not as a rect. A still can sit inside a stage that has already scaled it
     * (the tour's), and a rect is what the eye sees: read there it is 677px, and
     * scaling that by the width below shrinks it a second time.
     */
    const windowHeight = window_.offsetHeight;
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
      fit.style.height = scale < 1 ? `${windowHeight * scale}px` : '';
    };

    measure();
    new ResizeObserver(measure).observe(fit);
  }
}

// ---------------------------------------------------------------------------
// Transcript clips
// ---------------------------------------------------------------------------

/**
 * Shows a still's session at its newest message.
 *
 * The app opens a session scrolled to the end, and stays there while it follows a
 * reply; a session shorter than the window instead sits at the top, with its
 * insets and the space below it. A still is not a scroller — the page must not
 * trap the wheel — but `overflow: hidden` is still a scroll container, so setting
 * `scrollTop` to its own height is exactly the view the app would be in, with no
 * layout of this page's invention: no `justify-end`, no extra padding, no floating
 * column.
 *
 * Re-pinned on resize because the width decides where the text wraps, and so how
 * much of the session overflows the window.
 */
function initTranscriptClips(): void {
  for (const clip of document.querySelectorAll<HTMLElement>('[data-transcript-clip]')) {
    const column = clip.firstElementChild;
    if (!(column instanceof HTMLElement)) continue;
    const pin = (): void => {
      clip.scrollTop = clip.scrollHeight;
    };
    pin();
    // A scroll write cannot change the column's size, so this cannot loop.
    new ResizeObserver(pin).observe(column);
  }
}

// ---------------------------------------------------------------------------
// Stills that move
// ---------------------------------------------------------------------------

/**
 * How long a still holds one of its states before it moves to the next one.
 *
 * Two of the tour's windows claim something a single picture cannot show — that
 * sessions switch instantly, and that one turn has three densities — so they open
 * the next state on a timer. Nothing else on the page moves by itself.
 */
const AUTO_ADVANCE_MS = 1500;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether a still is the one on the window, and the page is the one in front:
 * both have to be true before a timer is allowed to change anything, because a
 * still moving behind the fold is work nobody sees.
 */
function stillIsWatched(root: HTMLElement): boolean {
  if (document.visibilityState !== 'visible') return false;
  const layer = root.closest<HTMLElement>('[data-stage-layer]');
  return layer === null || layer.dataset.active === 'true';
}

/** A pointer inside the window is a reader using it, and holds it where it is. */
function holdUnderPointer(root: HTMLElement, listener: (held: boolean) => void): void {
  root.addEventListener('pointerenter', () => listener(true));
  root.addEventListener('pointerleave', () => listener(false));
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

    const check = (button: HTMLElement): void => {
      const mode = button.dataset.viewModeButton;
      if (mode === undefined) return;
      root.dataset.active = mode;
      for (const other of buttons) {
        // `data-state` rather than an attribute of this page's own: it is what
        // Radix writes in the app, and what the app's own menu styles off
        // (`data-[state=checked]:...` in SessionToolbar.tsx). The check itself is
        // in every item and shown by this state, so it moves with the choice.
        other.dataset.state = other === button ? 'checked' : 'unchecked';
        other.setAttribute('aria-checked', String(other === button));
      }
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(menu.dataset.open !== 'true');
    });

    /*
     * Picking a density is a reader taking the wheel: the window keeps what they
     * chose and the timer stops for good. Otherwise the still cycles the three by
     * itself, menu open over it, so the claim the chapter makes — one turn, three
     * densities — is something the page shows rather than something it says.
     */
    let chosen: HTMLElement | null = null;

    for (const button of buttons) {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        chosen = button;
        check(button);
        close();
      });
    }

    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    let held = false;
    holdUnderPointer(root, (next) => {
      held = next;
    });

    window.setInterval(() => {
      if (chosen !== null || held || reducedMotion.matches) return;
      if (!stillIsWatched(root)) return;
      const current = buttons.findIndex((button) => button.dataset.state === 'checked');
      const next = buttons[(current + 1) % buttons.length];
      if (next !== undefined) check(next);
    }, AUTO_ADVANCE_MS);

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

/**
 * The minimal view's timer row, which unfolds the turn.
 *
 * In the app this row is a button over the turn's details (`minimalView.tsx`): the
 * whole activity list is folded behind it, and the chevron turns ninety degrees
 * while it is open. The still keeps the same affordance, one attribute deep, so
 * the panel reads as a view you can open rather than a screenshot of one.
 */
function initMinimalDetails(): void {
  for (const button of document.querySelectorAll<HTMLElement>('[data-minimal-timer]')) {
    const turn = button.closest<HTMLElement>('[data-minimal-turn]');
    if (turn === null) continue;

    button.addEventListener('click', () => {
      const open = turn.dataset.details !== 'true';
      turn.dataset.details = String(open);
      button.setAttribute('aria-expanded', String(open));
    });
  }
}

// ---------------------------------------------------------------------------
// The instant-switch still
// ---------------------------------------------------------------------------

/**
 * Opens the next session, once a second.
 *
 * The chapter claims that switching sessions is instant, and a picture of one
 * session cannot show that; the still draws three and moves through them, the way
 * the window redraws when a session is taken from the sidebar. It only moves while
 * the chapter is the one on the window — a timer running behind the fold is work
 * nobody sees — and it stands still under the pointer, because the minimap in that
 * window is real and a still that kept moving would take a reader's list away
 * mid-look. For a reader who asked for less motion it does not move at all, and the
 * first session simply stays open.
 */
function initSessionCycle(): void {
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  for (const cycle of document.querySelectorAll<HTMLElement>('[data-session-cycle]')) {
    const frames = Array.from(cycle.querySelectorAll<HTMLElement>('[data-session-frame]'));
    if (frames.length < 2) continue;
    let open = frames.findIndex((frame) => frame.dataset.active === 'true');
    if (open < 0) open = 0;

    // Less motion means the first session and nothing else — including for a
    // reader who turns the setting on while the still is rotating.
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) show(0);
    });

    let held = false;
    holdUnderPointer(cycle, (next) => {
      held = next;
    });

    const show = (next: number): void => {
      frames.forEach((frame, index) => {
        frame.dataset.active = String(index === next);
        frame.setAttribute('aria-hidden', String(index !== next));
      });
      open = next;
    };

    window.setInterval(() => {
      if (reducedMotion.matches || held) return;
      if (!stillIsWatched(cycle)) return;
      show((open + 1) % frames.length);
    }, AUTO_ADVANCE_MS);
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
    const message = messages[index];
    if (message === undefined) return;
    /*
     * The transcript's own scroller, not `scrollIntoView`: that scrolls every
     * scrollable ancestor too, and the page is one of them, so a click on a bar
     * would throw the reader out of the chapter they were reading. The behaviour
     * is the reader's choice as well — a jump is movement, not decoration.
     *
     * The distance is a rect difference divided by the scale, because a still can
     * be drawn inside a scaled stage: a rect is in the pixels the reader sees, and
     * `scrollTop` is in the app's own. Dividing the scroller's box by its layout
     * height is that scale, whatever set it.
     */
    const box = scroller.getBoundingClientRect();
    const scale = scroller.offsetHeight === 0 ? 1 : box.height / scroller.offsetHeight;
    const offset =
      (message.getBoundingClientRect().top - box.top) / (scale === 0 ? 1 : scale) +
      scroller.scrollTop;
    scroller.scrollTo({
      top: offset,
      behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth',
    });
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
      if (!Number.isFinite(index)) return;
      scrollToIndex(index);
      // The app's popover closes on the pick, and the bars stay for the next one.
      window.clearTimeout(closeTimer);
      panel.dataset.open = 'false';
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
        const time = preview.querySelector<HTMLElement>('[data-tree-preview-time]');
        const rowTime = row.element.querySelector<HTMLElement>('[data-tree-row-time]');
        if (time) time.textContent = rowTime?.textContent?.trim() ?? '';
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
 * Enter and click take the row: the selection moves, the row says so in
 * `data-selected` and `aria-selected`, and the input's `aria-activedescendant`
 * points at it. That is as far as a still goes — the window behind the palette is
 * drawn from build-time data, so there is no session to switch to — and it is the
 * whole of what the keys were already claiming to do.
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

  /**
   * The selection, in the two places that can read it: the row's own state, and
   * the input the reader is typing in. `aria-selected` was set once at build time
   * and never moved, so arrow keys lit one row and announced another.
   */
  function selectRow(selected: HTMLElement | null): void {
    for (const row of rows) {
      const isSelected = row === selected;
      row.dataset.selected = String(isSelected);
      row.setAttribute('aria-selected', String(isSelected));
    }
    if (selected?.id) input.setAttribute('aria-activedescendant', selected.id);
    else input.removeAttribute('aria-activedescendant');
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
    if (event.key === 'Escape') {
      input.value = '';
      applyFilter();
      return;
    }
    if (event.key === 'Enter') {
      // The row the input points at is the one Enter takes, which is the case
      // where the keys work and nothing visible happens.
      event.preventDefault();
      const selected = rows.find((row) => !row.hidden && row.dataset.selected === 'true');
      if (selected) root.dataset.selectedTitle = selected.dataset.title ?? '';
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

  for (const row of rows) {
    row.addEventListener('click', () => {
      selectRow(row);
      root.dataset.selectedTitle = row.dataset.title ?? '';
    });
  }

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
// Feature tour
// ---------------------------------------------------------------------------

/** The width from which the window is pinned beside its chapters. */
const STAGE_WIDE_QUERY = '(min-width: 1024px)';

/** The smallest the still is allowed to get, and the air kept above and below it. */
const STAGE_MIN_HEIGHT_PX = 320;
const STAGE_FLOOR_GAP_PX = 24;
/**
 * Where a chapter counts as being read.
 *
 * The line sits above the middle of the screen because the chapter's heading and
 * its number are the first two lines of it: by the time the heading of the next
 * chapter reaches this line the reader is looking at it, not the one before.
 */
const STAGE_TRIGGER_RATIO = 0.4;

/**
 * The tour: one window, seven chapters.
 *
 * From `lg` up the window is pinned (`position: sticky` in the markup) and the
 * chapters scroll past it. This only decides which chapter is current — the last
 * one whose heading has crossed the trigger line — and the CSS cross-fades the
 * window to match. Nothing captures the wheel, nothing fake-scrolls, and the
 * chapters are ordinary sections, so the page still reads as an article.
 *
 * Below `lg` there is no room for both, and the layout is the one this section
 * had before the window was pinned: the index chooses a chapter and all seven
 * stills stay stacked. That is the difference the `wide` query drives — the
 * chapters are hidden down to the current one only there, which is one attribute
 * write per chapter rather than a second set of styles.
 *
 * The still is the page's own scaling, and it is not a reflow: the app is drawn at
 * its 1200x800 and the whole thing is scaled in one transform until it fits the
 * screen it is centred on. A window with its own scrollbar, or one whose composer
 * sits below the fold, would be a picture of a different app.
 */
function initFeatureStage(): void {
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  if (stage === null) return;

  const chips = Array.from(stage.querySelectorAll<HTMLButtonElement>('[data-stage-chip]'));
  const panels = Array.from(stage.querySelectorAll<HTMLElement>('[data-stage-copy]'));
  const layers = Array.from(stage.querySelectorAll<HTMLElement>('[data-stage-layer]'));
  const scene = stage.querySelector<HTMLElement>('[data-stage-scene]');
  if (scene === null || chips.length === 0 || chips.length !== layers.length) return;

  const frames = layers.map((layer) => layer.querySelector<HTMLElement>('[data-stage-frame]'));
  const scalers = layers.map((layer) => layer.querySelector<HTMLElement>('[data-stage-scaler]'));

  const wide = window.matchMedia(STAGE_WIDE_QUERY);
  let current = Math.max(
    0,
    panels.findIndex((panel) => panel.dataset.current === 'true'),
  );

  /**
   * Paints the step at `index`.
   *
   * Under `lg` that is one chapter and one still; from `lg` up every chapter is
   * shown and only the still changes hands, because the chapters are what the
   * reader is scrolling through.
   */
  const select = (index: number): void => {
    current = index;
    chips.forEach((chip, position) => {
      const on = position === index;
      chip.dataset.active = on ? 'true' : 'false';
      chip.setAttribute('aria-selected', on ? 'true' : 'false');
      chip.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel, position) => {
      const on = wide.matches || position === index;
      panel.dataset.active = on ? 'true' : 'false';
      panel.dataset.current = position === index ? 'true' : 'false';
      if (on) panel.removeAttribute('aria-hidden');
      else panel.setAttribute('aria-hidden', 'true');
    });
    layers.forEach((layer, position) => {
      layer.dataset.active = position === index ? 'true' : 'false';
    });
  };

  /*
   * The still gets the rest of the screen: the window is scaled into the viewport
   * it is centred on, up to its own size. The page is not shifted by this — the
   * scene's height is on the scene, and every still in it keeps the app's 1200x800
   * and is scaled in one transform, so the app's own layout, and every measurement
   * hanging off it, is untouched.
   */
  const fit = (): void => {
    const reset = (): void => {
      scene.style.height = '';
      frames.forEach((frame, index) => {
        const scaler = scalers[index];
        if (frame === null || scaler === null) return;
        frame.style.width = '';
        frame.style.height = '';
        scaler.style.width = '';
        scaler.style.height = '';
        scaler.style.transform = '';
      });
    };
    if (!wide.matches) {
      reset();
      return;
    }

    const height = Math.min(
      WINDOW_HEIGHT_PX,
      Math.max(STAGE_MIN_HEIGHT_PX, window.innerHeight - STAGE_FLOOR_GAP_PX * 2),
    );
    const scale = Math.min(1, scene.clientWidth / WINDOW_WIDTH_PX, height / WINDOW_HEIGHT_PX);
    if (scale >= 1) {
      reset();
      return;
    }
    scene.style.height = `${Math.round(WINDOW_HEIGHT_PX * scale)}px`;
    frames.forEach((frame, index) => {
      const scaler = scalers[index];
      if (frame === null || scaler === null) return;
      // The frame reserves the box the still *renders* into; the scaler is the
      // app's own 1200x800, laid out at that size and shrunk in one transform.
      // Leaving the scaler at the frame's width instead would lay the window out
      // at a narrower size and then shrink that — the app would be drawn at a
      // width it does not have, and the still would leave a gap in its column.
      frame.style.width = `${WINDOW_WIDTH_PX * scale}px`;
      frame.style.height = `${WINDOW_HEIGHT_PX * scale}px`;
      scaler.style.width = `${WINDOW_WIDTH_PX}px`;
      scaler.style.height = `${WINDOW_HEIGHT_PX}px`;
      scaler.style.transform = `scale(${scale})`;
    });
  };

  /** The chapter whose heading was the last to cross the trigger line. */
  const readIndex = (): number => {
    const line = window.innerHeight * STAGE_TRIGGER_RATIO;
    let index = 0;
    for (const [position, panel] of panels.entries()) {
      if (panel.getBoundingClientRect().top <= line) index = position;
    }
    return index;
  };

  let frame = 0;
  const sync = (): void => {
    frame = 0;
    if (!wide.matches) return;
    const index = readIndex();
    if (index !== current) select(index);
  };
  const onScroll = (): void => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(sync);
  };

  chips.forEach((chip, index) => {
    chip.addEventListener('click', () => select(index));
    // The keys a tablist is expected to answer to.
    chip.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? chips.length - 1
            : (index + step + chips.length) % chips.length;
      select(next);
      chips[next].focus();
    });
  });

  select(current);
  fit();
  sync();
  // A resize changes the room and the trigger line; the words above the still
  // change with the font, so the fit is redone once the fonts have settled.
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener(
    'resize',
    () => {
      fit();
      sync();
    },
    { passive: true },
  );
  wide.addEventListener('change', () => {
    select(current);
    fit();
    sync();
  });
  void document.fonts.ready.then(fit);
}

// ---------------------------------------------------------------------------
// The tree's explanation
// ---------------------------------------------------------------------------

/**
 * The tree's `?`, and the dialog it opens.
 *
 * The app explains the tree in a dialog off a round `?`, so the page does too: the
 * button is real and the dialog ships closed, which is the state the app is in
 * until someone asks. Escape closes it, as a dialog should.
 */
function initTreeHelp(): void {
  const toggles = document.querySelectorAll<HTMLElement>('[data-tree-help-toggle]');
  if (toggles.length === 0) return;

  const dialogs: HTMLElement[] = [];

  for (const toggle of toggles) {
    const scope = toggle.closest<HTMLElement>('[data-window-canvas]');
    if (scope === null) continue;
    const dialog = scope.querySelector<HTMLElement>('[data-tree-help]');
    if (dialog === null) continue;
    dialogs.push(dialog);

    /*
     * Opening a dialog means moving focus into it, and closing it means handing
     * focus back to the `?` that opened it — otherwise the reader is left on the
     * page behind a panel that has just gone, with no idea where they are.
     */
    const opener = { current: toggle };

    const set = (open: boolean): void => {
      if ((dialog.dataset.state === 'open') === open) return;
      dialog.dataset.state = open ? 'open' : 'closed';
      for (const other of scope.querySelectorAll<HTMLElement>('[data-tree-help-toggle]')) {
        other.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      if (open) {
        opener.current = toggle;
        dialog.focus();
      } else {
        opener.current.focus();
      }
    };

    toggle.addEventListener('click', () => {
      set(dialog.dataset.state !== 'open');
    });
  }

  if (dialogs.length === 0) return;
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const dialog of dialogs) {
      if (dialog.dataset.state !== 'open') continue;
      dialog.dataset.state = 'closed';
      const scope = dialog.closest<HTMLElement>('[data-window-canvas]');
      if (scope === null) continue;
      for (const toggle of scope.querySelectorAll<HTMLElement>('[data-tree-help-toggle]')) {
        toggle.setAttribute('aria-expanded', 'false');
      }
      // Escape is a close, and a close puts the reader back where they were.
      scope.querySelector<HTMLElement>('[data-tree-help-toggle]')?.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/** Below this the page is at the top, and the header is just the page. */
const HEADER_SCROLLED_AT_PX = 4;

/**
 * The header's state, for a header that is invisible until it has to be.
 *
 * At the top of the page the bar has no fill and no rule — it is the page. The
 * moment anything scrolls under it that stops being true, and it takes the
 * translucent fill and the blur that keep the links legible. The classes off
 * `data-scrolled` are in the markup, so the styling stays where the styling is.
 *
 * `sync` runs once on load as well, because a reload can restore a scrolled
 * position, or arrive on an anchor, before any scroll event is fired.
 */
function initHeaderScroll(): void {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (header === null) return;

  let frame = 0;
  const sync = (): void => {
    frame = 0;
    header.toggleAttribute('data-scrolled', window.scrollY > HEADER_SCROLLED_AT_PX);
  };
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(sync);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  sync();
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

initFeatureStage();
initTreeHelp();
initHeaderScroll();
initThemeToggle();
initWindowFits();
initTranscriptClips();
initViewModes();
initMinimalDetails();
initSessionCycle();
initMinimaps();
initSessionTrees();
initSessionSwitcher();
initTerminalTabs();
void initDownload();
