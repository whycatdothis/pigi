import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

const THUMB_MIN_HEIGHT_PX = 24;

/**
 * A fixed-width rail drawn over a native scroll container, for the places the
 * platform rail cannot be trusted: Chrome widens its scrollbar when hovered or
 * grabbed and no CSS switch turns that expansion off. The viewport keeps its
 * native scrolling (wheel, trackpad, momentum) and hides its own rail with
 * `no-scrollbar`; this component only mirrors the position. The scroll
 * listener therefore never reads layout — geometry is measured by a
 * ResizeObserver and cached, and the thumb moves by transform.
 */
export function ThinScrollbar({
  viewportRef,
  contentRef,
  className,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** The content inside the viewport; observed so a growth in rows remeasures the thumb. */
  contentRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}): React.JSX.Element | null {
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef({ viewport: 0, content: 0 });
  const thumbHeightRef = useRef(0);
  const dragRef = useRef<{ startY: number; startScrollTop: number } | null>(null);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [dragging, setDragging] = useState(false);

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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const viewportHeight = viewport.clientHeight;
      const content = viewport.scrollHeight;
      geometryRef.current = { viewport: viewportHeight, content };
      const next =
        content > viewportHeight
          ? Math.max((viewportHeight / content) * viewportHeight, THUMB_MIN_HEIGHT_PX)
          : 0;
      thumbHeightRef.current = next;
      setThumbHeight(next);
      updateThumb();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const content = contentRef?.current;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [viewportRef, contentRef, updateThumb]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateThumb);
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [viewportRef, updateThumb]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    const rail = railRef.current;
    if (!viewport || !rail) return;
    const { viewport: viewportHeight, content } = geometryRef.current;
    const travel = content - viewportHeight;
    if (travel <= 0) return;
    const maxOffset = viewportHeight - thumbHeightRef.current;
    const railTop = rail.getBoundingClientRect().top;
    const thumbTop = railTop + (viewport.scrollTop / travel) * maxOffset;
    if (event.clientY >= thumbTop && event.clientY <= thumbTop + thumbHeightRef.current) {
      dragRef.current = { startY: event.clientY, startScrollTop: viewport.scrollTop };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      return;
    }
    // Track click: jump so the thumb centres on the pointer.
    const ratio = (event.clientY - railTop - thumbHeightRef.current / 2) / maxOffset;
    viewport.scrollTop = Math.min(Math.max(ratio, 0), 1) * travel;
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

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (thumbHeight === 0) return null;

  return (
    <div
      ref={railRef}
      data-testid="thin-scrollbar"
      data-dragging={dragging}
      className={cn('sidebar-rail', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        ref={thumbRef}
        data-testid="thin-scrollbar-thumb"
        className="sidebar-rail-thumb touch-none"
        style={{ height: thumbHeight }}
      />
    </div>
  );
}
