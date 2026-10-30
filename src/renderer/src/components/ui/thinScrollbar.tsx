import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

const THUMB_MIN_HEIGHT_PX = 24;
/** A tenth of the track: how short the thumb is allowed to get, so a long transcript never leaves a stub. */
const MIN_TRACK_FRACTION = 0.1;
/** Long enough that the thumb is still there when the eye comes back after a flick. */
const HIDE_DELAY_MS = 1500;

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
 * that shows while the list scrolls and while it is hovered or dragged, and a
 * wider thumb while dragged.
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
      setVisible(true);
      scheduleHide();
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', onScroll);
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
