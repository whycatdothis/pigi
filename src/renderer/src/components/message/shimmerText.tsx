import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Sweep speed of the shimmer band, in px/s. The band travels its own width
 * plus the text width per cycle (enter + sweep + exit), so on a ~90px element
 * with a 100px band that is 190px per cycle; the base 2.5s class duration
 * yields 76px/s — close to the previous 72px/s reference.
 */
export const SHIMMER_SPEED_PX_PER_SECOND = 72;

/** Fixed band width: the highlight stays a narrow, focused strip no matter
 *  how long the command line is. */
export const SHIMMER_BAND_WIDTH_PX = 100;

interface ShimmerTextProps {
  /** A second copy of the row's content; rendered brighter and clipped. */
  children: React.ReactNode;
  /** Explicit cycle duration. Pass a width-derived value to keep the sweep at
   *  a constant px/s speed across element widths; defaults to the 2.5s class. */
  durationMs?: number;
}

/**
 * Highlight that sweeps across the text it is placed over.
 *
 * The overlay is a second copy of the glyphs rather than a gradient band: a band
 * paints its own rectangle over the background, which shows as a light smear
 * once the theme's background is not white. Brightening the glyphs and clipping
 * them can only affect the text, whatever is behind it.
 *
 * Callers render the content twice — once normally, once here — because the
 * layout must stay with the original copy.
 */
export default function ShimmerText({ children, durationMs }: ShimmerTextProps): React.JSX.Element {
  const overlayRef = useRef<HTMLSpanElement>(null);
  const [scanWidth, setScanWidth] = useState(0);
  // The band only starts once the scan width has been measured. Until then
  // animation-name is pinned to 'none'; flipping it back to the class animation
  // restarts it from the beginning — so a freshly shown row's sweep always
  // starts at the left edge instead of joining a cycle that began while the
  // element had zero width.
  const [measured, setMeasured] = useState(false);

  // The band sweeps only the text it labels: measure the parent (the row it is
  // placed inside), so truncated long commands do not waste the sweep on
  // invisible areas.
  useLayoutEffect(() => {
    const parent = overlayRef.current?.parentElement;
    if (!parent) return;
    const update = (): void => {
      const width = parent.clientWidth;
      setScanWidth(width);
      if (width > 0) setMeasured(true);
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(parent);
    return () => resizeObserver.disconnect();
  }, []);

  // Custom CSS properties need a cast (React does not type them).
  const style = {
    '--shimmer-band-width': `${SHIMMER_BAND_WIDTH_PX}px`,
    '--shimmer-scan-width': `${scanWidth}px`,
    animationDuration: durationMs !== undefined ? `${durationMs}ms` : undefined,
    // undefined = the class animation applies; 'none' = hold until measured.
    animationName: measured ? undefined : 'none',
  } as React.CSSProperties;

  return (
    <span
      ref={overlayRef}
      aria-hidden
      className="shimmer-overlay pointer-events-none absolute inset-0"
      style={style}
    >
      {children}
    </span>
  );
}
