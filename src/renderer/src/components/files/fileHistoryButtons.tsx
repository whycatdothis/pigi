import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { useAppStore } from '../../state/appStore';
import { Button } from '../ui/button';
import { Kbd } from '../ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

function HistoryButton({
  label,
  disabled,
  shortcutBinding,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  shortcutBinding: ShortcutBinding | undefined;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="text-muted-foreground [-webkit-app-region:no-drag]"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcutBinding && <Kbd>{formatShortcutLabel(shortcutBinding)}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Back and forward through the Files tab's history of the project. */
export function FileHistoryButtons({
  projectPath,
  shortcutBindings,
  onStep,
}: {
  projectPath: string;
  shortcutBindings: Map<string, ShortcutBinding> | null;
  onStep: (step: -1 | 1) => void;
}): React.JSX.Element {
  const history = useAppStore((state) => state.fileHistoryByProject.get(projectPath));
  const canGoBack = (history?.index ?? 0) > 0;
  const canGoForward = history !== undefined && history.index < history.visits.length - 1;

  return (
    <TooltipProvider delayDuration={400}>
      <HistoryButton
        label="Back"
        disabled={!canGoBack}
        shortcutBinding={shortcutBindings?.get('navigation.prev')}
        onClick={() => onStep(-1)}
      >
        <IconArrowLeft />
      </HistoryButton>
      <HistoryButton
        label="Forward"
        disabled={!canGoForward}
        shortcutBinding={shortcutBindings?.get('navigation.next')}
        onClick={() => onStep(1)}
      >
        <IconArrowRight />
      </HistoryButton>
    </TooltipProvider>
  );
}
