import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface RememberedScroll {
  key: string;
  top: number;
  left: number;
}

const rememberedByViewer = new Map<string, RememberedScroll>();

/**
 * Switching workspace tabs unmounts the Files and Git viewers; this brings a
 * remounted viewer back to where it was. Each viewer keeps only its last
 * `key`, so opening another file still starts at its top. `key` is null until
 * the content has rendered, because restoring into a shorter loading state
 * would clamp the offset.
 */
export function useRememberedScroll(
  ref: RefObject<HTMLElement | null>,
  viewer: string,
  key: string | null,
): void {
  const restoredRef = useRef(false);

  useLayoutEffect(() => {
    if (restoredRef.current || key === null) return;
    restoredRef.current = true;
    const remembered = rememberedByViewer.get(viewer);
    if (remembered?.key === key) ref.current?.scrollTo(remembered.left, remembered.top);
  }, [ref, viewer, key]);

  useEffect(() => {
    const element = ref.current;
    if (!element || key === null) return;
    const remember = (): void => {
      rememberedByViewer.set(viewer, { key, top: element.scrollTop, left: element.scrollLeft });
    };
    element.addEventListener('scroll', remember, { passive: true });
    return () => element.removeEventListener('scroll', remember);
  }, [ref, viewer, key]);
}
