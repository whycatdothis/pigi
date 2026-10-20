import { useShallow } from 'zustand/react/shallow';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { cn } from '../../lib/utils';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { useAppStore } from '../../state/appStore';
import { PanelIcon } from '../panelIcon';
import { Button } from '../ui/button';
import { Kbd } from '../ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface SidebarToggleProps {
  shortcutBinding: ShortcutBinding | undefined;
  className?: string;
  style?: React.CSSProperties;
}

export function SidebarToggle({
  shortcutBinding,
  className,
  style,
}: SidebarToggleProps): React.JSX.Element {
  const { sidebarExpanded, toggleSidebar } = useAppStore(
    useShallow((state) => ({
      sidebarExpanded: state.sidebarExpanded,
      toggleSidebar: state.toggleSidebar,
    })),
  );
  const label = sidebarExpanded ? 'Hide sidebar' : 'Show sidebar';

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={toggleSidebar}
            className={cn('text-muted-foreground [-webkit-app-region:no-drag]', className)}
            style={style}
          >
            <PanelIcon side="left" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {label}
          {shortcutBinding && <Kbd>{formatShortcutLabel(shortcutBinding)}</Kbd>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
