import { useLayoutEffect, useRef, useState } from 'react';

/** Sweep speed, in px/s. One cycle moves the highlight across the element, so
 *  the duration follows the measured width. */
const SHIMMER_SPEED_PX_PER_SECOND = 72;
const MIN_DURATION_MS = 2500;
const MAX_DURATION_MS = 5000;

/**
 * Highlight that sweeps across the text it is placed over.
 *
 * The sweep is the text's own colour: a `background-clip: text` gradient whose
 * position animates, so there is exactly one copy of the glyphs. An earlier
 * version painted a second, filter-brightened copy of the same text and revealed
 * it through a moving clip window; the two rasterizations (subpixel base,
 * grayscale-in-a-filtered-layer copy) did not land on identical edges, which
 * read as doubled glyphs.
 *
 * Descendants that set their own colour (a command prefix, say) keep painting
 * solid and are simply not swept; the rest inherit `transparent` from the
 * wrapper and show the gradient.
 */
export default function ShimmerText({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const elementRef = useRef<HTMLSpanElement>(null);
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const update = (): void => {
      const width = element.clientWidth;
      if (width <= 0) return;
      const scaled = (width / SHIMMER_SPEED_PX_PER_SECOND) * 1000;
      setDurationMs(Math.round(Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, scaled))));
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <span
      ref={elementRef}
      className="shimmer-text"
      style={durationMs !== undefined ? { animationDuration: `${durationMs}ms` } : undefined}
    >
      {children}
    </span>
  );
}
