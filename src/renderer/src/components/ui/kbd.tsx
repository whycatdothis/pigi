import { cn } from '@/lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-normal text-muted-foreground select-none in-data-[variant=inverted]:bg-background/20 in-data-[variant=inverted]:text-background dark:in-data-[variant=inverted]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

/** A compact shortcut hint inside a button, after its label. */
const BUTTON_KBD_CLASS_NAME = 'h-4 min-w-4 px-1 text-3xs';

/** A compact shortcut hint inside a primary button, after its label. */
const PRIMARY_BUTTON_KBD_CLASS_NAME = `${BUTTON_KBD_CLASS_NAME} bg-primary-foreground/15 text-primary-foreground/80`;

/**
 * Keeps a button's hint out of sight until the button is hovered. The hint keeps
 * its space so revealing it never resizes the button or recenters its label.
 */
const HOVER_REVEAL_KBD_CLASS_NAME =
  'opacity-0 transition-opacity group-hover/button:opacity-100 group-focus-visible/button:opacity-100';

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

export {
  Kbd,
  KbdGroup,
  BUTTON_KBD_CLASS_NAME,
  PRIMARY_BUTTON_KBD_CLASS_NAME,
  HOVER_REVEAL_KBD_CLASS_NAME,
};
