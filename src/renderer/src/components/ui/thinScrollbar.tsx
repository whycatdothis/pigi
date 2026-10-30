import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

const THUMB_MIN_HEIGHT_PX = 24;
/** A tenth of the track: how short the thumb is allowed to get, so a long transcript never leaves a stub. */
const MIN_TRACK_FRACTION = 0.1;
/** Long enough that the thumb is still there when the eye comes back after a flick. */
const HIDE_DELAY_MS = 1500;
/**
 * How recently the reader's own input must have landed for a scroll to count
 * as theirs. Only needs to bridge an input event to the scroll events it
 * causes (and the short smooth-scroll animation a single notch can run), so it
 * stays far below the hide delay.
 */
const INPUT_REVEAL_WINDOW_MS = 300;
/** The keys a focused scroll container scrolls with, and so the reader's own. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/**
 * A thumb-only scrollbar drawn over a native scroll container, for places the
 * platform rail cannot be trusted: Chrome draws a track and widens its rail
 * when hovered or grabbed, and no CSS switch turns either off. The viewport
 * keeps its native scrolling (wheel, trackpad, momentum) and hides its own
 * rail with `no-scrollbar`; this component only mirrors the position.
 *
 * Only the thumb takes pointer events, so a wheel or a click beside it reaches
 * the list as if nothing were drawn there. The scroll listener never measures
 * — geometry is measured by a ResizeObserver and cached — and the thumb moves
 * by transform. macOS sets the expectations for the rest: no track, a thumb
 * that shows while the reader scrolls the list and while it is hovered or
 * dragged, and a wider thumb while dragged.
 *
 * "While the reader scrolls" is the strict reading: a scroll only reveals the
 * thumb when the reader's own input — wheel, touch, a scroll key — just
 * preceded it. The list also moves on its own — bottom follow during
 * streaming, session restore, a jump to a turn — and those writes are
 * indistinguishable from a wheel in the scroll event itself, so going by
 * scroll alone leaves the thumb on screen through every stream.
 */
export function ThinScrollbar({
  viewportRef,
  contentRef,
  onDragStart,
  onDragEnd,
  className,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** The content inside the viewport; observed so a growth in rows remeasures the thumb. */
  contentRef?: React.RefObject<HTMLDivElement | null>;
  /** A thumb drag takes over the scroll position, so bottom follow must let go. */
  onDragStart?: () => void;
  /** The drag ended; the caller re-derives a follow that still applies. */
  onDragEnd?: () => void;
  className?: string;
}): React.JSX.Element | null {
  const thumbRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef({ viewport: 0, content: 0 });
  const thumbHeightRef = useRef(0);
  const dragRef = useRef<{ startY: number; startScrollTop: number } | null>(null);
  const hoveredRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `performance.now()` of the last wheel, touch drag, or scroll key over the viewport. */
  const inputAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [visible, setVisible] = useState(false);

  const updateThumb = useCallback(() => {
    const viewport = viewportRef.current;
    const thumb = thumbRef.current;
    if (!viewport || !thumb) return;
    const { viewport: viewportHeight, content } = geometryRef.current;
    const travel = content - viewportHeight;
    if (travel <= 0) return;
    const maxOffset = viewportHeight - thumbHeightRef.current;
    const offset = (viewport.scrollTop / travel) * maxOffset;
    thumb.style.transform = `translateY(${offset}px)`;
  }, [viewportRef]);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      if (!hoveredRef.current && !dragRef.current) setVisible(false);
    }, HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const viewportHeight = viewport.clientHeight;
      const content = viewport.scrollHeight;
      geometryRef.current = { viewport: viewportHeight, content };
      // The visible fraction is square-rooted: taken literally it shrinks a
      // long transcript's thumb to a stub, and an unhittable one at that.
      const height =
        content > viewportHeight
          ? Math.max(
              viewportHeight * Math.max(Math.sqrt(viewportHeight / content), MIN_TRACK_FRACTION),
              THUMB_MIN_HEIGHT_PX,
            )
          : 0;
      // Written straight to the element: the transform below already assumes
      // the new height, and a state render would land it a frame late.
      thumbHeightRef.current = height;
      const thumb = thumbRef.current;
      if (thumb) thumb.style.height = `${height}px`;
      setMounted(height > 0);
      updateThumb();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const content = contentRef?.current;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [viewportRef, contentRef, updateThumb]);

  // The thumb mounts after the measuring effect, so its size is applied here,
  // before the paint that shows it.
  useLayoutEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    thumb.style.height = `${thumbHeightRef.current}px`;
    updateThumb();
  }, [mounted, updateThumb]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateThumb);
      if (performance.now() - inputAtRef.current > INPUT_REVEAL_WINDOW_MS) return;
      setVisible(true);
      scheduleHide();
    };
    const onInput = (): void => {
      inputAtRef.current = performance.now();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (SCROLL_KEYS.has(event.key)) onInput();
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    // Captured, so input a child stops still counts: the event says who is
    // scrolling, whether or not it reached the list. A touch drag reports
    // through touchmove — it scrolls the list without ever firing wheel.
    viewport.addEventListener('wheel', onInput, { capture: true, passive: true });
    viewport.addEventListener('touchmove', onInput, { capture: true, passive: true });
    // The list is focusable (aria-label + tabIndex), so the keyboard scrolls
    // it too; nothing editable lives inside it, so no key here is typing.
    viewport.addEventListener('keydown', onKeyDown);
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      viewport.removeEventListener('wheel', onInput, { capture: true });
      viewport.removeEventListener('touchmove', onInput, { capture: true });
      viewport.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frame);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [viewportRef, updateThumb, scheduleHide]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { viewport: viewportHeight, content } = geometryRef.current;
    if (content <= viewportHeight) return;
    dragRef.current = { startY: event.clientY, startScrollTop: viewport.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setVisible(true);
    onDragStart?.();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport) return;
    const { viewport: viewportHeight, content } = geometryRef.current;
    const travel = content - viewportHeight;
    const maxOffset = viewportHeight - thumbHeightRef.current;
    if (travel <= 0 || maxOffset <= 0) return;
    viewport.scrollTop = drag.startScrollTop + ((event.clientY - drag.startY) / maxOffset) * travel;
    updateThumb();
  };

  const endDrag = useCallback((): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    onDragEnd?.();
    scheduleHide();
  }, [onDragEnd, scheduleHide]);

  // The wheel over the thumb belongs to the list, as it does over any other
  // pixel beside it; nothing here is a scroller of its own.
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop += event.deltaY;
  };

  const handlePointerEnter = (): void => {
    hoveredRef.current = true;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const handlePointerLeave = (): void => {
    hoveredRef.current = false;
    if (!dragRef.current) scheduleHide();
  };

  if (!mounted) return null;

  return (
    <div
      data-testid="thin-scrollbar"
      data-dragging={dragging}
      data-visible={visible}
      className={cn('thin-scrollbar', className)}
    >
      <div
        ref={thumbRef}
        data-testid="thin-scrollbar-thumb"
        className="thin-scrollbar-thumb touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />
    </div>
  );
}
