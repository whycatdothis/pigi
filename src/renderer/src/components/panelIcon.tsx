import { superellipseRectPath } from '../lib/squirclePath';
import { cn } from '../lib/utils';

export type PanelSide = 'left' | 'right' | 'bottom';

// Same 24-unit grid and 1.5 stroke as the Tabler/Lucide icons. Every edge sits
// on a multiple of 1.5 units, i.e. a whole pixel at the default 16px size.
const PANEL_STRIP_RECTS: Record<
  PanelSide,
  { x: number; y: number; width: number; height: number }
> = {
  left: { x: 4.5, y: 6, width: 6, height: 12 },
  right: { x: 13.5, y: 6, width: 6, height: 12 },
  bottom: { x: 4.5, y: 12, width: 15, height: 6 },
};

const PANEL_OUTLINE_PATH = superellipseRectPath({
  x: 2.25,
  y: 3.75,
  width: 19.5,
  height: 16.5,
  radius: 2.25,
});

/** Panel toggle icon with a muted strip on the side the panel lives. */
export function PanelIcon({
  side,
  className,
}: {
  side: PanelSide;
  className?: string;
}): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn('size-4 shrink-0', className)}>
      <rect {...PANEL_STRIP_RECTS[side]} fill="currentColor" fillOpacity={0.45} />
      <path d={PANEL_OUTLINE_PATH} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
