import { useLayoutEffect, useRef } from 'react';
import Zoom from 'react-medium-image-zoom';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import 'react-medium-image-zoom/dist/styles.css';

/** Breathing room around zoomed content, so it reads as floating over the window. */
export const ZOOM_MARGIN_PX = 24;
/** How far a pointer may travel and still count as a click rather than a drag. */
const DRAG_SLOP_PX = 4;
const MAX_ZOOM_SCALE = 8;

/**
 * What the zoom overlay holds: the content, with panning and zooming of its own.
 *
 * Two gestures belong to the overlay rather than to the content — the wheel and
 * the touch move that dismiss it — and they are only the reader's when they are
 * not the middle of a gesture of this content's. A wheel that pans or zooms the
 * content stays here, and a drag that happens to end on the content is the end
 * of a gesture rather than the click that dismisses the overlay.
 */
export function ZoomPanContent({
  img,
  buttonUnzoom,
  modalState,
  onUnzoom,
}: {
  img: React.ReactElement | null;
  buttonUnzoom: React.ReactElement<HTMLButtonElement>;
  modalState: string;
  onUnzoom: (e: Event) => void;
}): React.JSX.Element {
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Every visit starts at the content as it was fitted to the window, rather
  // than wherever the last one was left — and a drawing the window fitted to
  // less than its own size is put at its own size as the overlay opens, so what
  // the reader sees is the drawing they clicked, already readable. Opened at the
  // fitted size and resized after, it arrives small and then changes size: a
  // second event where they asked for one. The size is set again once the
  // overlay has opened, in case its own alignment to the size it gained took the
  // first one back; from there the reader's own zoom is theirs to keep.
  useLayoutEffect(() => {
    const transform = transformRef.current;
    if (transform === null) return;
    const surface = surfaceRef.current;

    if (modalState === 'LOADING' || modalState === 'LOADED') {
      const scale = drawingScale(surface);
      if (scale > 1) {
        transform.centerView(scale, 0);
      } else {
        transform.resetTransform(0);
      }
      return modalState === 'LOADING' ? undefined : keepAtDrawingScale(transform, surface, scale);
    }

    transform.resetTransform(modalState === 'UNLOADING' ? overlayTransitionMs(surface) : 0);
    return undefined;
  }, [modalState]);

  return (
    <>
      <div
        ref={surfaceRef}
        className="zoom-pan-surface"
        onPointerDownCapture={(event) => {
          pressedAt.current = { x: event.clientX, y: event.clientY };
          dragged.current = false;
        }}
        onPointerMoveCapture={(event) => {
          const start = pressedAt.current;
          if (start === null || dragged.current) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_SLOP_PX) {
            dragged.current = true;
          }
        }}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          dragged.current = false;
          event.stopPropagation();
        }}
        onClick={(event) => {
          // A click on the space around the content dismisses the overlay, which
          // is what it does about a click on its own background: this surface is
          // the element that covers it.
          const target = event.target;
          if (target instanceof Element && target.closest('[data-rmiz-modal-img]') !== null) {
            return;
          }
          onUnzoom(event.nativeEvent);
        }}
        onWheel={(event) => {
          event.stopPropagation();
        }}
        onTouchMove={(event) => {
          event.stopPropagation();
        }}
      >
        <TransformWrapper
          ref={transformRef}
          maxScale={MAX_ZOOM_SCALE}
          panning={{ allowLeftClickPan: true }}
          // Otherwise a plain wheel zooms and trackpad panning never sees it; pinch is ctrl+wheel.
          wheel={{ wheelDisabled: true }}
          trackPadPanning={{ disabled: false }}
          doubleClick={{ disabled: true }}
          keyboard={{ disabled: false }}
        >
          {/* The content is positioned inside this box by the overlay itself, so
              the box is what the content is panned and zoomed within. */}
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{ width: '100%', height: '100%' }}
          >
            {img}
          </TransformComponent>
        </TransformWrapper>
      </div>
      {buttonUnzoom}
    </>
  );
}

/**
 * How far the overlay has to enlarge what it was given to show it at its own
 * size.
 *
 * The overlay fits its content to the window, and what it fits is the copy of
 * the block that was clicked: a diagram the transcript had to shrink to fit its
 * column therefore opens exactly as small as the block already was, which is the
 * size the reader could not read. `1` for everything else, images included: they
 * are sized from their own pixels, so fitting them to the window is an
 * enlargement already.
 */
function drawingScale(surface: HTMLElement | null): number {
  const modalImage = modalImageOf(surface);
  if (modalImage === null) return 1;
  const drawing = modalImage.querySelector('svg');
  if (drawing === null) return 1;

  // The width the drawing was laid out at, and the width the overlay gave it.
  const laidOut = Number(drawing.getAttribute('width'));
  const fitted = Number.parseFloat(modalImage.style.width);
  if (!Number.isFinite(laidOut) || laidOut <= 0 || !Number.isFinite(fitted) || fitted <= 0) {
    return 1;
  }

  return Math.min(MAX_ZOOM_SCALE, Math.max(1, laidOut / fitted));
}

/**
 * How long the overlay takes to open or close, so that a drawing's own scale
 * travels with it. Read rather than assumed: reduced motion turns it off, and
 * a resize while open shortens it.
 */
function overlayTransitionMs(surface: HTMLElement | null): number {
  const modalImage = modalImageOf(surface);
  if (modalImage === null) return 0;

  const duration = getComputedStyle(modalImage).transitionDuration.trim();
  const time = Number.parseFloat(duration);
  if (!Number.isFinite(time)) return 0;
  return duration.endsWith('ms') ? time : time * 1000;
}

/**
 * Keeps a drawing at its own size while the window changes around it: the
 * overlay re-fits its copy of the block on every resize, which would take the
 * drawing back down towards the size it was shrunk to. Once the reader has
 * zoomed the drawing, the scale is theirs, and a resize leaves it alone.
 */
function keepAtDrawingScale(
  transform: ReactZoomPanPinchRef,
  surface: HTMLElement | null,
  applied: number,
): () => void {
  const modalImage = modalImageOf(surface);
  if (modalImage === null) return () => undefined;

  const observer = new ResizeObserver(() => {
    const next = drawingScale(surface);
    if (Math.abs(next - applied) < 0.01) return;
    if (Math.abs(transform.state.scale - applied) > 0.01) return;
    applied = next;
    transform.centerView(next, 0);
  });
  observer.observe(modalImage);

  return () => {
    observer.disconnect();
  };
}

/** The element the overlay moves: its copy of the content, in the dialog. */
function modalImageOf(surface: HTMLElement | null): HTMLElement | null {
  return surface?.querySelector<HTMLElement>('[data-rmiz-modal-img]') ?? null;
}

export function ZoomableImage(props: React.ComponentProps<'img'>): React.JSX.Element {
  return (
    // span: markdown images sit inside a <p>, where a div is invalid.
    <Zoom wrapElement="span" zoomMargin={ZOOM_MARGIN_PX} ZoomContent={ZoomPanContent}>
      <img {...props} />
    </Zoom>
  );
}
