import { cn } from '../../lib/utils';

/**
 * Rotates its icon on the compositor. The span turns, not the svg: Chromium
 * cannot run a rotation of an svg element on the compositor (the transform
 * depends on its box size), so it would freeze whenever the main thread is busy.
 *
 * Pass the speed with the animation class, e.g. `animate-[spin_1.8s_linear_infinite]`.
 */
export function SpinningIcon({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span className={cn('inline-flex shrink-0 will-change-transform', className)}>{children}</span>
  );
}
