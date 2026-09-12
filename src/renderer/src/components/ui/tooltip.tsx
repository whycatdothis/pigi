/**
 * Local deviations from the shadcn original, collected here so that a future
 * upstream update (`npx shadcn@latest add tooltip --diff`) is a short,
 * deliberate review instead of a guess:
 *
 * - No arrow: the pointer triangle is gone for every tooltip in the app.
 * - `sideOffset` defaults to 6px instead of 0 — the arrow used to provide that
 *   separation.
 * - Open/close motion lives in `assets/main.css` (`tooltip-enter` /
 *   `tooltip-exit`), replacing the stock zoom + slide-in utilities. The keyframes
 *   are keyed off the `tooltip-surface` class set below.
 * - `variant` defaults to `surface` (the app's popover tone) instead of
 *   shadcn's inverted black bubble; `inverted` is still available per call site.
 *
 * Everything else follows upstream.
 */
import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

type TooltipVariant = 'surface' | 'inverted';

const TOOLTIP_VARIANT_CLASS_NAMES: Record<TooltipVariant, string> = {
  // Same family as popover / dialog / context menu: popover tone, hairline
  // ring, soft shadow. Follows the theme, so dark mode needs nothing extra.
  surface:
    'rounded-md bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md ring-[0.5px] ring-foreground/25',
  // shadcn's stock inverted bubble. Loud by design; use it where the tooltip
  // sits on top of busy content and needs to win.
  inverted: 'rounded-md bg-foreground px-3 py-1.5 text-background',
};

function TooltipContent({
  className,
  sideOffset = 6,
  variant = 'surface',
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  variant?: TooltipVariant;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-variant={variant}
        sideOffset={sideOffset}
        className={cn(
          'tooltip-surface z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 text-xs has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm',
          TOOLTIP_VARIANT_CLASS_NAMES[variant],
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
