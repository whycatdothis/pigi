import { IconCheck } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { TOOL_BLOCK_VIEW_MODES, type ToolBlockViewMode } from '../../../../shared/pigiSettings';
import { SettingsGroup } from './settingsControls';
import { cn } from '@/lib/utils';

const VIEW_MODE_LABELS: Record<ToolBlockViewMode, { label: string; description: string }> = {
  default: {
    label: 'Show all',
    description: 'Display every tool call as an individual expanded block.',
  },
  compact_read: {
    label: 'Compact',
    description: 'Collapse consecutive read-only tool calls into a single group.',
  },
  minimal: {
    label: 'Minimal',
    description: 'Activity view: working timer, tool cards, and a final summary per turn.',
  },
};

export function ChatSettings(): React.JSX.Element {
  const toolBlockViewMode = useSettingsStore((state) => state.chat.toolBlockViewMode);
  const setToolBlockViewMode = useSettingsStore((state) => state.setToolBlockViewMode);

  return (
    <SettingsGroup
      title="Tool view"
      description="How tool calls are rendered in the transcript. Also switchable from the session toolbar."
    >
      {TOOL_BLOCK_VIEW_MODES.map((mode) => {
        const active = mode === toolBlockViewMode;
        const { label, description } = VIEW_MODE_LABELS[mode];
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => setToolBlockViewMode(mode)}
            className={cn(
              'flex w-full items-center justify-between gap-6 px-3 py-2.5 text-left transition-colors',
              active ? 'bg-[var(--system-accent)]/5' : 'hover:bg-muted/40',
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  'text-sm',
                  active ? 'text-[var(--system-accent)]' : 'text-foreground',
                )}
              >
                {label}
              </span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </span>
            {active && <IconCheck size={16} className="shrink-0 text-[var(--system-accent)]" />}
          </button>
        );
      })}
    </SettingsGroup>
  );
}
