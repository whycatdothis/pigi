import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

export const PANEL_RESIZING_ATTRIBUTE = 'data-panel-resizing';
/** Dragging below this fraction of the minimum collapses a collapsible panel. */
const COLLAPSE_FRACTION_OF_MINIMUM = 0.5;
/** Reopening needs this much more, so a hand resting on the threshold does not
 *  flip the panel back and forth. */
const COLLAPSE_HYSTERESIS_PX = 8;

interface PanelResizeOptions {
  containerRef: RefObject<HTMLElement | null>;
  property: `--${string}`;
  /** The edge being dragged: left/top grow opposite to pointer movement. */
  edge: 'left' | 'right' | 'top' | 'bottom';
  size: number;
  getBounds: () => { minimum: number; maximum: number };
  onCommit: (size: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
  /** Makes the panel collapsible: called live as the drag crosses the
   *  threshold either way. A drag that ends collapsed keeps the committed size,
   *  so reopening restores the width from before it. */
  onCollapsedChange?: (collapsed: boolean) => void;
}

/** Live geometry belongs to CSS; React/store state receives only the final size. */
export function usePanelResize({
  containerRef,
  property,
  edge,
  size,
  getBounds,
  onCommit,
  onDraggingChange,
  onCollapsedChange,
}: PanelResizeOptions): (event: ReactPointerEvent<HTMLElement>) => void {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || cleanupRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      event.preventDefault();
      const pointerId = event.pointerId;
      const horizontal = edge === 'left' || edge === 'right';
      const direction = edge === 'left' || edge === 'top' ? -1 : 1;
      const startPosition = horizontal ? event.clientX : event.clientY;
      // A stored size can exceed bounds that shrank with the window (and that
      // CSS already caps); start from what is shown so there is no dead zone.
      const startBounds = getBounds();
      const startSize = Math.min(Math.max(size, startBounds.minimum), startBounds.maximum);
      let pendingSize = startSize;
      let collapsed = false;
      let frame: number | null = null;

      const applySize = (): void => {
        frame = null;
        container.style.setProperty(property, `${pendingSize}px`);
      };
      // Collapsing or reopening mid-drag unmarks the container so the panel's
      // own show/hide transitions play; it tracks the pointer exactly again
      // once its transition ends. Not on transitioncancel: a reopen cancels the
      // collapse still finishing, and would then snap open. Dragging on past
      // the minimum meanwhile only retargets the transition, an eased follow.
      const handleTransitionEnd = (transitionEvent: TransitionEvent): void => {
        if (transitionEvent.target === container && !collapsed) {
          container.setAttribute(PANEL_RESIZING_ATTRIBUTE, '');
        }
      };
      const handlePointerMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== pointerId) return;
        const position = horizontal ? moveEvent.clientX : moveEvent.clientY;
        const { minimum, maximum } = getBounds();
        const draggedSize = startSize + direction * (position - startPosition);
        if (onCollapsedChange) {
          const threshold =
            minimum * COLLAPSE_FRACTION_OF_MINIMUM + (collapsed ? COLLAPSE_HYSTERESIS_PX : 0);
          const shouldCollapse = draggedSize < threshold;
          if (shouldCollapse !== collapsed) {
            collapsed = shouldCollapse;
            container.removeAttribute(PANEL_RESIZING_ATTRIBUTE);
            onCollapsedChange(collapsed);
          }
        }
        pendingSize = Math.min(Math.max(draggedSize, minimum), maximum);
        if (frame === null) frame = requestAnimationFrame(applySize);
      };
      const finish = (): void => {
        if (frame !== null) cancelAnimationFrame(frame);
        if (collapsed) {
          pendingSize = size;
        }
        applySize();
        if (!collapsed) {
          onCommit(pendingSize);
        }
        onDraggingChange?.(false);
        container.removeAttribute(PANEL_RESIZING_ATTRIBUTE);
        cursorOverlay.remove();
        container.removeEventListener('transitionend', handleTransitionEnd);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerEnd);
        window.removeEventListener('pointercancel', handlePointerEnd);
        window.removeEventListener('blur', finish);
        cleanupRef.current = null;
      };
      const handlePointerEnd = (endEvent: PointerEvent): void => {
        if (endEvent.pointerId === pointerId) finish();
      };

      // Covers the window for the drag: the resize cursor holds once the pointer
      // outruns the handle or a collapse unmounts it, and what the pointer
      // passes over gets no hover or tooltips. The listeners are on window.
      // A manual popover sits in the top layer, above every z-index, without
      // taking focus; its UA style is already fixed at inset 0.
      const cursorOverlay = document.createElement('div');
      cursorOverlay.popover = 'manual';
      cursorOverlay.className = horizontal
        ? 'size-full bg-transparent cursor-col-resize'
        : 'size-full bg-transparent cursor-row-resize';

      cleanupRef.current = finish;
      container.setAttribute(PANEL_RESIZING_ATTRIBUTE, '');
      document.body.append(cursorOverlay);
      cursorOverlay.showPopover();
      onDraggingChange?.(true);
      container.addEventListener('transitionend', handleTransitionEnd);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerEnd);
      window.addEventListener('pointercancel', handlePointerEnd);
      window.addEventListener('blur', finish);
    },
    [containerRef, edge, getBounds, onCommit, onDraggingChange, onCollapsedChange, property, size],
  );
}
