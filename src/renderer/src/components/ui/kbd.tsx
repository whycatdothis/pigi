import { cn } from '@/lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border border-foreground/10 bg-muted px-1 font-sans text-xs font-normal text-muted-foreground select-none in-data-[variant=inverted]:border-background/20 in-data-[variant=inverted]:bg-background/20 in-data-[variant=inverted]:text-background dark:in-data-[variant=inverted]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A keycap at the end of a sidebar or menu row (New chat, Open project,
 * Settings, Back to app). It stays out of sight until the row is hovered or
 * reached from the keyboard, so the row reads as a label at rest. The border
 * comes from `Kbd`: the row's hover fill and the chip's fill are the same gray,
 * and without an outline the keycap turns into plain text.
 * Focus needs both group names: a `SidebarMenuItem` wraps the button that takes
 * focus, while a popover `MenuItem` is that button itself.
 */
const MENU_ROW_KBD_CLASS_NAME =
  'ml-auto hidden shrink-0 group-hover/menu-item:inline-flex group-focus-visible/menu-item:inline-flex group-focus-visible/menu-button:inline-flex';

/**
 * A compact keycap, for a hint tucked inside another control: a button's label,
 * a sentence. A standalone keycap (a setting's binding, the selection popover's
 * Q) keeps the default size, which is meant to be read at a glance.
 */
const COMPACT_KBD_CLASS_NAME = 'h-4 min-w-4 px-1 text-3xs';

/** A compact hint inside a primary button, after its label. */
const PRIMARY_BUTTON_KBD_CLASS_NAME = `${COMPACT_KBD_CLASS_NAME} border-transparent bg-primary-foreground/15 text-primary-foreground/80`;

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
  MENU_ROW_KBD_CLASS_NAME,
  COMPACT_KBD_CLASS_NAME,
  PRIMARY_BUTTON_KBD_CLASS_NAME,
};
