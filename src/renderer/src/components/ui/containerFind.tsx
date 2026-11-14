import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useHighlightTextNodes } from '../../lib/highlightMatches';
import { useFindShortcut } from '../../hooks/useFindShortcut';
import FindPopover from './findPopover';

/** Overlays content on the left while it scrolls: the match may sit under it. */
const STICKY_INSET_ATTRIBUTE = 'data-sticky-inset';
const SCROLLABLE_OVERFLOW = /^(auto|scroll)$/;

function isScrollable(element: HTMLElement, axis: 'x' | 'y'): boolean {
  const overflow = getComputedStyle(element)[axis === 'x' ? 'overflowX' : 'overflowY'];
  if (!SCROLLABLE_OVERFLOW.test(overflow)) return false;
  return axis === 'x'
    ? element.scrollWidth > element.clientWidth
    : element.scrollHeight > element.clientHeight;
}

/** The elements between the match and the container that scroll on their own. */
function nestedScrollers(node: Node, container: HTMLElement): HTMLElement[] {
  const scrollers: HTMLElement[] = [];
  let element: Element | null = node instanceof Element ? node : node.parentElement;
  while (element && element !== container && container.contains(element)) {
    if (
      element instanceof HTMLElement &&
      (isScrollable(element, 'x') || isScrollable(element, 'y'))
    ) {
      scrollers.push(element);
    }
    element = element.parentElement;
  }
  return scrollers;
}

/** How far the container's sticky overlays cover its left edge at `rect`. */
function stickyInset(container: HTMLElement, rect: DOMRect): number {
  const box = container.getBoundingClientRect();
  let inset = 0;
  for (const overlay of container.querySelectorAll<HTMLElement>(`[${STICKY_INSET_ATTRIBUTE}]`)) {
    const overlayRect = overlay.getBoundingClientRect();
    if (overlayRect.bottom <= rect.top || overlayRect.top >= rect.bottom) continue;
    inset = Math.max(inset, overlayRect.right - box.left);
  }
  return inset;
}

/** Scrolls only along an axis the match is outside of, centering it there. */
function scrollRangeIntoView(container: HTMLElement, range: Range): void {
  // Innermost first: an inner pane's own scroll changes where the outer one
  // has to scroll to.
  for (const scroller of nestedScrollers(range.startContainer, container)) {
    scrollOneIntoView(scroller, range.getBoundingClientRect(), 0, 0);
  }
  scrollOneIntoView(
    container,
    range.getBoundingClientRect(),
    stickyInset(container, range.getBoundingClientRect()),
    0,
  );
}

function scrollOneIntoView(
  container: HTMLElement,
  rect: DOMRect,
  insetLeft: number,
  insetTop: number,
): void {
  const box = container.getBoundingClientRect();
  const visibleLeft = box.left + insetLeft;
  const visibleTop = box.top + insetTop;
  const top =
    rect.top < visibleTop || rect.bottom > box.bottom
      ? container.scrollTop + rect.top - visibleTop - container.clientHeight / 2
      : container.scrollTop;
  const left =
    rect.left < visibleLeft || rect.right > box.right
      ? container.scrollLeft + rect.left - visibleLeft - container.clientWidth / 2
      : container.scrollLeft;
  container.scrollTo({ top, left, behavior: 'auto' });
}

/**
 * Cmd+F over what a scroll container has rendered, like the browser's find:
 * text that is collapsed away or not mounted is not found. Only for views
 * that render all their content; the virtualized transcript has MessageSearch.
 */
export default function ContainerFind({
  containerRef,
  active,
  placeholder,
  onBeforeJump,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** False while the view is mounted but hidden: no shortcut, no bar. */
  active: boolean;
  placeholder: string;
  /** Runs before a jump scrolls the container, e.g. to stop bottom-following. */
  onBeforeJump?: () => void;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const matchesRef = useRef<Range[][]>([]);
  // A new query jumps to its first match once its matches are computed;
  // later recomputes (streaming, async highlighting) leave the scroll alone.
  const jumpPendingRef = useRef(false);

  const jumpTo = useCallback(
    (match: Range[] | undefined) => {
      const container = containerRef.current;
      if (!match?.[0] || !container) return;
      onBeforeJump?.();
      scrollRangeIntoView(container, match[0]);
    },
    [containerRef, onBeforeJump],
  );

  const handleMatches = useCallback(
    (matches: Range[][]) => {
      matchesRef.current = matches;
      setMatchCount(matches.length);
      if (!jumpPendingRef.current) return;
      jumpPendingRef.current = false;
      jumpTo(matches[0]);
    },
    [jumpTo],
  );

  const clampedIndex = Math.min(activeIndex, Math.max(0, matchCount - 1));
  const searching = open && active;
  useHighlightTextNodes(
    containerRef,
    searching ? query : '',
    searching ? clampedIndex : null,
    handleMatches,
  );

  const handleFind = useCallback(() => {
    setFocusRequest((previous) => previous + 1);
    if (!open) {
      jumpPendingRef.current = true;
      setActiveIndex(0);
      setOpen(true);
    }
  }, [open]);
  useFindShortcut(active, handleFind);

  const handleStep = (direction: 1 | -1): void => {
    const count = matchesRef.current.length;
    if (count === 0) return;
    const next = (((clampedIndex + direction) % count) + count) % count;
    setActiveIndex(next);
    jumpTo(matchesRef.current[next]);
  };

  const keepOpenOnInteract = (target: Element): boolean =>
    containerRef.current?.contains(target) ?? false;

  return (
    <FindPopover
      open={searching}
      onOpenChange={setOpen}
      query={query}
      onQueryChange={(next) => {
        jumpPendingRef.current = true;
        setActiveIndex(0);
        setQuery(next);
      }}
      matchCount={query.trim() ? matchCount : null}
      activeIndex={clampedIndex}
      onStep={handleStep}
      focusRequest={focusRequest}
      placeholder={placeholder}
      keepOpenOnInteract={keepOpenOnInteract}
    />
  );
}
