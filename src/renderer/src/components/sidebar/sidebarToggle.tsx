import { IconLayoutSidebar } from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { useSystemSymbol } from '../../hooks/useSystemSymbol';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../state/appStore';
import { Button } from '../ui/button';

const SIDEBAR_SYMBOL_NAME = 'sidebar.left';

interface SidebarToggleProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SidebarToggle({ className, style }: SidebarToggleProps): React.JSX.Element {
  const { sidebarExpanded, toggleSidebar } = useAppStore(
    useShallow((state) => ({
      sidebarExpanded: state.sidebarExpanded,
      toggleSidebar: state.toggleSidebar,
    })),
  );
  const symbolUrl = useSystemSymbol(SIDEBAR_SYMBOL_NAME);
  const label = sidebarExpanded ? 'Hide sidebar' : 'Show sidebar';

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={toggleSidebar}
      className={cn('text-muted-foreground [-webkit-app-region:no-drag]', className)}
      style={style}
    >
      {symbolUrl ? (
        // The SF Symbol is a black template image; masking it lets currentColor tint it.
        <span
          aria-hidden
          className="h-3.5 w-4.5 bg-current"
          style={{
            maskImage: `url(${symbolUrl})`,
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
          }}
        />
      ) : (
        <IconLayoutSidebar />
      )}
    </Button>
  );
}
