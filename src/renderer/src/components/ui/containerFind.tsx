import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useHighlightTextNodes } from '../../lib/highlightMatches';
import { useFindShortcut } from '../../hooks/useFindShortcut';
import FindPopover from './findPopover';

/** Scrolls only along an axis the match is outside of, centering it there. */
function scrollRangeIntoView(container: HTMLElement, range: Range): void {
  const rect = range.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  const top =
    rect.top < box.top || rect.bottom > box.bottom
      ? container.scrollTop + rect.top - box.top - box.height / 2
      : container.scrollTop;
  const left =
    rect.left < box.left || rect.right > box.right
      ? container.scrollLeft + rect.left - box.left - box.width / 2
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
