import { useEffect, type RefObject } from 'react';

/**
 * Keeps the line at the bottom of a scroller in place when the scroller's
 * height changes, so the terminal opening pushes the content up with it
 * instead of the lower lines sliding out of view.
 */
export function useBottomAnchoredScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const next = element.clientHeight;
      element.scrollTop += height - next;
      height = next;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
