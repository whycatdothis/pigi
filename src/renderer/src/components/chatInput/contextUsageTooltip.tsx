import type { ContextUsage } from '../../../../shared/ipcContract';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { formatContextWindow, formatUsedContext, formatAutoCompactExplanation } from './formatters';

export function ContextUsageTooltip({
  label,
  contextUsage,
  autoCompactionEnabled,
}: {
  label: string;
  contextUsage: ContextUsage | null;
  autoCompactionEnabled: boolean;
}): React.JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="shrink-0 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="max-w-none">
          <div className="flex flex-col gap-1 text-left">
            <span>Total context window: {formatContextWindow(contextUsage)}</span>
            <span>Used: {formatUsedContext(contextUsage)}</span>
            <span>{formatAutoCompactExplanation(autoCompactionEnabled)}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
