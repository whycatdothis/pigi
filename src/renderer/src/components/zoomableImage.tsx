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

  // Every visit starts at the content as the overlay fitted it to the window,
  // rather than wherever the last one was left. The fit shows a whole drawing or
  // image; zooming in from there is the reader's own gesture, and is not reset
  // by anything but the next visit or the end of this one. Closing returns to
  // the whole content first, so the flight back to the block is the drawing the
  // block shows, not a zoomed slice of it.
  useLayoutEffect(() => {
    if (modalState === 'LOADING' || modalState === 'UNLOADING') {
      transformRef.current?.resetTransform(0);
    }
  }, [modalState]);

  return (
    <>
      <div
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

export function ZoomableImage(props: React.ComponentProps<'img'>): React.JSX.Element {
  return (
    // span: markdown images sit inside a <p>, where a div is invalid.
    <Zoom wrapElement="span" zoomMargin={ZOOM_MARGIN_PX} ZoomContent={ZoomPanContent}>
      <img {...props} />
    </Zoom>
  );
}
