import type React from 'react';
import { cn } from '../../lib/utils';

interface MenuItemProps extends React.ComponentProps<'button'> {
  inset?: boolean;
}

export function MenuItem({
  className,
  inset,
  children,
  ...props
}: MenuItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        // Matches the sidebar's own menu button (h-8, text-sm, px-2) so a row does
        // not shrink when the popover it belongs to opens.
        'flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-sm text-popover-foreground outline-none transition-colors hover:bg-foreground/5 [&_svg]:size-4 [&_svg]:shrink-0',
        inset && 'pl-8',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
