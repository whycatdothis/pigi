import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

export const PANEL_RESIZING_ATTRIBUTE = 'data-panel-resizing';

interface PanelResizeOptions {
  containerRef: RefObject<HTMLElement | null>;
  property: `--${string}`;
  /** The edge being dragged: left/top grow opposite to pointer movement. */
  edge: 'left' | 'right' | 'top' | 'bottom';
  size: number;
  getBounds: () => { minimum: number; maximum: number };
  onCommit: (size: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
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
      let pendingSize = size;
      let frame: number | null = null;

      const applySize = (): void => {
        frame = null;
        container.style.setProperty(property, `${pendingSize}px`);
      };
      const handlePointerMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== pointerId) return;
        const position = horizontal ? moveEvent.clientX : moveEvent.clientY;
        const { minimum, maximum } = getBounds();
        pendingSize = Math.min(
          Math.max(size + direction * (position - startPosition), minimum),
          maximum,
        );
        if (frame === null) frame = requestAnimationFrame(applySize);
      };
      const finish = (): void => {
        if (frame !== null) cancelAnimationFrame(frame);
        applySize();
        onCommit(pendingSize);
        onDraggingChange?.(false);
        container.removeAttribute(PANEL_RESIZING_ATTRIBUTE);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerEnd);
        window.removeEventListener('pointercancel', handlePointerEnd);
        window.removeEventListener('blur', finish);
        cleanupRef.current = null;
      };
      const handlePointerEnd = (endEvent: PointerEvent): void => {
        if (endEvent.pointerId === pointerId) finish();
      };

      cleanupRef.current = finish;
      container.setAttribute(PANEL_RESIZING_ATTRIBUTE, '');
      onDraggingChange?.(true);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerEnd);
      window.addEventListener('pointercancel', handlePointerEnd);
      window.addEventListener('blur', finish);
    },
    [containerRef, edge, getBounds, onCommit, onDraggingChange, property, size],
  );
}
