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
import { WINDOW_HEIGHT_PX, WINDOW_WIDTH_PX } from '../lib/appLayout';
import {
  ACCENT_PRESETS,
  SITE_THEME,
  appearanceSummary,
  previewProperties,
  themeTokens,
  type ThemeChoice,
} from '../lib/appTheme';
import { getLineWidth, measureMaxLineWidth } from '../lib/minimapGeometry';

// Below the app's minimum window width (680, `createMainWindow.ts`) draw the
// window at that width and scale it down; above it the window is fluid.
function initWindowFits(): void {
  for (const fit of document.querySelectorAll<HTMLElement>('[data-window-fit]')) {
    const canvas = fit.querySelector<HTMLElement>('[data-window-canvas]');
    const window_ = canvas?.firstElementChild;
    const minWidth = Number(fit.dataset.windowFit);
    if (!(window_ instanceof HTMLElement) || !canvas || !Number.isFinite(minWidth) || minWidth <= 0)
      continue;

    // offsetHeight, not a rect: inside the tour's already-scaled stage a rect
    // height would get scaled a second time.
    const windowHeight = window_.offsetHeight;
    let appliedScale = 0;

    const measure = (): void => {
      const available = fit.clientWidth;
      const scale = Math.min(1, available / minWidth);
      // The observer refires on the height written below; this stops the loop.
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

// Pins the transcript to its end like the app; `overflow: hidden` still scrolls
// programmatically without trapping the wheel. Width changes wrapping, so re-pin.
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

const AUTO_ADVANCE_MS = 1500;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function stillIsWatched(root: HTMLElement): boolean {
  if (document.visibilityState !== 'visible') return false;
  const layer = root.closest<HTMLElement>('[data-stage-layer]');
  return layer === null || layer.dataset.active === 'true';
}

function holdUnderPointer(root: HTMLElement, listener: (held: boolean) => void): void {
  root.addEventListener('pointerenter', () => listener(true));
  root.addEventListener('pointerleave', () => listener(false));
}

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
        // `data-state` mirrors Radix, which the app's menu styles key off
        // (SessionToolbar.tsx).
        other.dataset.state = other === button ? 'checked' : 'unchecked';
        other.setAttribute('aria-checked', String(other === button));
      }
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(menu.dataset.open !== 'true');
    });

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

    document.addEventListener('click', () => {
      if (menu.dataset.open === 'true') close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.dataset.open === 'true') close();
    });
  }
}

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

function initSessionCycle(): void {
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  for (const cycle of document.querySelectorAll<HTMLElement>('[data-session-cycle]')) {
    const frames = Array.from(cycle.querySelectorAll<HTMLElement>('[data-session-frame]'));
    if (frames.length < 2) continue;
    let open = frames.findIndex((frame) => frame.dataset.active === 'true');
    if (open < 0) open = 0;

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

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 300;

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
  // On a markup mismatch leave the strip inert rather than guess the mapping.
  if (bars.length === 0 || bars.length !== entries.length || bars.length !== messages.length) {
    return;
  }

  let activeIndex = -1;
  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  let frame = 0;

  // Same width rule as the app's `UserMessageMiniMap.tsx`; re-measured because
  // the markup is built at the default window width and this window is fluid.
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
    // Not `scrollIntoView`: it would scroll the page too. Rects are divided by
    // the scale because the still may sit inside a scaled stage.
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

  // Nearest to the viewport centre, as in the app's `useActiveUserMessageIndex`,
  // so scrolling to the end lights the last message.
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
      window.clearTimeout(closeTimer);
      panel.dataset.open = 'false';
    });
  }

  sizeBars();
  new ResizeObserver(sizeBars).observe(scroller);

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

const PREVIEW_OPEN_DELAY_MS = 260;

interface TreeRowInfo extends TreeRowShape {
  id: string;
  onPath: boolean;
  element: HTMLElement;
}

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

  // depth -> id of the row the active path goes through at that depth.
  const pathOwners = new Map<number, string>();
  for (const row of rowInfos) {
    if (row.onPath) pathOwners.set(row.depth, row.id);
  }

  // The session's current row: the last on-path row.
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

  // aria-selected must move with the visual selection: when it was left at its
  // build-time value, arrow keys lit one row and announced another.
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

const STAGE_WIDE_QUERY = '(min-width: 1024px)';

const STAGE_MIN_HEIGHT_PX = 320;
const STAGE_FLOOR_GAP_PX = 24;
// Above the middle: once the next chapter's heading reaches it, the reader is on it.
const STAGE_TRIGGER_RATIO = 0.4;

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
      // The scaler lays out at the full window size and shrinks; laying it out at
      // the frame's width would draw the app at a width it does not have.
      frame.style.width = `${WINDOW_WIDTH_PX * scale}px`;
      frame.style.height = `${WINDOW_HEIGHT_PX * scale}px`;
      scaler.style.width = `${WINDOW_WIDTH_PX}px`;
      scaler.style.height = `${WINDOW_HEIGHT_PX}px`;
      scaler.style.transform = `scale(${scale})`;
    });
  };

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
  // Web fonts change the text height above the still.
  void document.fonts.ready.then(fit);
}

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
      scope.querySelector<HTMLElement>('[data-tree-help-toggle]')?.focus();
    }
  });
}

const HEADER_SCROLLED_AT_PX = 4;

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
  // A reload or anchor can land scrolled without firing a scroll event.
  sync();
}

type ColorModeChoice = 'light' | 'dark' | 'system';

// Same key and values as the app; `system` is stored as no entry.
const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function storedColorMode(): ColorModeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function setColorMode(mode: ColorModeChoice): void {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  try {
    if (mode === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private mode: the mode still holds for this page view.
  }
}

// The initial mode is set before first paint by the inline script in BaseLayout.
function initThemeToggle(): void {
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (storedColorMode() === 'system') setColorMode('system');
  });

  const button = document.querySelector<HTMLElement>('[data-theme-toggle]');
  if (button === null) return;
  button.addEventListener('click', () => {
    setColorMode(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  });
}

function initTerminalTabs(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-terminal-tabs]')) {
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('[data-terminal-tab]'));

    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const other of tabs) {
          // `data-state` mirrors Radix, which the tab's classes style off.
          other.dataset.state = other === tab ? 'active' : 'inactive';
        }
      });
    }
  }
}

function initFileViewers(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-file-viewer]')) {
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-file-view]'));
    for (const button of buttons) {
      button.addEventListener('click', () => {
        root.dataset.view = button.dataset.fileView ?? 'preview';
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      });
    }
  }
}

function initPackageTabs(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-packages]')) {
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('[data-packages-tab]'));
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        root.dataset.tab = tab.dataset.packagesTab ?? 'installed';
        for (const other of tabs) {
          other.dataset.state = other === tab ? 'active' : 'inactive';
          other.setAttribute('aria-selected', String(other === tab));
        }
      });
    }
  }
}

function initQuoteStills(): void {
  for (const button of document.querySelectorAll<HTMLElement>('[data-quote-button]')) {
    const scope = button.closest<HTMLElement>('[data-window-canvas]');
    const list = scope?.querySelector<HTMLElement>('[data-quote-list]');
    const template = scope?.querySelector<HTMLTemplateElement>('[data-quote-template]');
    const count = scope?.querySelector<HTMLElement>('[data-quote-count]');
    const selection = button.parentElement?.querySelector<HTMLElement>('mark');
    if (!list || !template || !count || !selection) continue;

    button.addEventListener('click', () => {
      const card = template.content.cloneNode(true);
      if (!(card instanceof DocumentFragment)) return;
      const text = card.querySelector<HTMLElement>('[data-quote-text]');
      if (text) text.textContent = selection.textContent?.trim() ?? '';
      const item = card.firstElementChild;
      list.append(card);
      count.textContent = String(list.children.length);
      selection.replaceWith(document.createTextNode(selection.textContent ?? ''));
      // The button is removed, so move focus to the new card.
      if (item instanceof HTMLElement) {
        item.tabIndex = -1;
        item.focus({ preventScroll: true });
      }
      button.remove();
    });
  }
}

// Writes the derived `--app-*` tokens onto <html> so the whole page re-colours.
// Not persisted; until the first pick the build-time CSS stays in charge.
function initAppearanceStill(): void {
  const previews = document.querySelector<HTMLElement>('[data-mode-previews]');
  const root = previews?.closest<HTMLElement>('[data-window-canvas]');
  if (!previews || !root) return;
  const modeButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-theme-mode]'));
  const picker = root.querySelector<HTMLElement>('[data-theme-picker]');
  const menu = root.querySelector<HTMLElement>('[data-theme-menu]');
  const options = Array.from(root.querySelectorAll<HTMLElement>('[data-theme-option]'));
  const accents = Array.from(root.querySelectorAll<HTMLElement>('[data-accent-option]'));
  if (!picker || !menu) return;

  let choice: ThemeChoice = SITE_THEME;
  let chosen = false;
  const html = document.documentElement;
  const currentMode = (): 'light' | 'dark' => (html.classList.contains('dark') ? 'dark' : 'light');

  const setText = (selector: string, text: string): void => {
    for (const element of root.querySelectorAll<HTMLElement>(selector)) element.textContent = text;
  };

  const render = (): void => {
    const mode = currentMode();
    if (chosen) {
      for (const [name, value] of Object.entries(themeTokens(choice, mode))) {
        html.style.setProperty(name, value);
      }
    }
    for (const [name, value] of Object.entries(previewProperties(choice))) {
      previews.style.setProperty(name, value);
    }

    const summary = appearanceSummary(choice, mode);
    setText('[data-theme-name]', summary.themeName);
    const badge = root.querySelector<HTMLElement>('[data-theme-badge]');
    if (badge) {
      badge.style.color = summary.badgeHex;
      badge.style.backgroundColor = `${summary.badgeHex}1f`;
    }
    for (const role of ['background', 'foreground'] as const) {
      setText(`[data-color-hex="${role}"]`, summary[role]);
      const swatch = root.querySelector<HTMLElement>(`[data-color-swatch="${role}"]`);
      if (swatch) swatch.style.backgroundColor = summary[role];
    }
    setText('[data-contrast]', summary.contrast);
    const separate = root.querySelector<HTMLElement>('[data-separate-switch]');
    if (separate) separate.dataset.state = summary.separate ? 'checked' : 'unchecked';
    for (const accent of accents) {
      accent.setAttribute('aria-pressed', String(accent.dataset.accentOption === summary.accentId));
    }
    for (const option of options) {
      const on = option.dataset.themeOption === choice.themeId && summary.themeName !== 'Custom';
      option.dataset.state = on ? 'checked' : 'unchecked';
      option.setAttribute('aria-checked', String(on));
    }
    const stored = storedColorMode();
    for (const button of modeButtons) {
      button.setAttribute('aria-checked', String(button.dataset.themeMode === stored));
    }
  };

  const choose = (next: ThemeChoice): void => {
    choice = next;
    chosen = true;
    render();
  };

  const setMenuOpen = (open: boolean): void => {
    menu.dataset.open = String(open);
    picker.dataset.state = open ? 'open' : 'closed';
    picker.setAttribute('aria-expanded', String(open));
  };

  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      const mode = button.dataset.themeMode;
      if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return;
      setColorMode(mode);
      // The <html> class may not change, but the stored choice the radios show does.
      render();
    });
  }
  for (const accent of accents) {
    const preset = ACCENT_PRESETS.find((candidate) => candidate.id === accent.dataset.accentOption);
    if (!preset) continue;
    accent.addEventListener('click', () => {
      choose({ ...choice, accent: { presetId: preset.id } });
    });
  }
  picker.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuOpen(menu.dataset.open !== 'true');
  });
  for (const option of options) {
    option.addEventListener('click', (event) => {
      event.stopPropagation();
      choose({ themeId: option.dataset.themeOption ?? SITE_THEME.themeId });
      setMenuOpen(false);
    });
  }
  document.addEventListener('click', () => setMenuOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menu.dataset.open !== 'true') return;
    setMenuOpen(false);
    picker.focus({ preventScroll: true });
  });

  // Mode switches from anywhere (header, system, these radios) arrive as a class change.
  new MutationObserver(render).observe(html, { attributes: true, attributeFilter: ['class'] });
  render();
}

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
initFileViewers();
initPackageTabs();
initQuoteStills();
initAppearanceStill();
