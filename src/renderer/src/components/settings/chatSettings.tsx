import { useSettingsStore } from '../../state/settingsStore';
import { TOOL_BLOCK_VIEW_MODES, type ToolBlockViewMode } from '../../../../shared/pigiSettings';
import { Switch } from '../ui/switch';
import { SegmentedControl, SettingsGroup, SettingsRow } from './settingsControls';

/** Same labels as the session toolbar's view menu. */
const VIEW_MODE_LABELS: Record<ToolBlockViewMode, string> = {
  default: 'Show All',
  compact_read: 'Compact',
  minimal: 'Minimal',
};

export function ChatSettings(): React.JSX.Element {
  const toolBlockViewMode = useSettingsStore((state) => state.chat.toolBlockViewMode);
  const setToolBlockViewMode = useSettingsStore((state) => state.setToolBlockViewMode);
  const pinSentMessage = useSettingsStore((state) => state.chat.pinSentMessage);
  const setPinSentMessage = useSettingsStore((state) => state.setPinSentMessage);

  return (
    <SettingsGroup>
      <SettingsRow label="Default view" description="How tool calls are shown.">
        <SegmentedControl
          value={toolBlockViewMode}
          options={TOOL_BLOCK_VIEW_MODES.map((mode) => ({
            value: mode,
            label: VIEW_MODE_LABELS[mode],
          }))}
          onChange={setToolBlockViewMode}
        />
      </SettingsRow>
      {toolBlockViewMode === 'minimal' && (
        <SettingsRow
          label="Pin minimal view sent message"
          description="Off: follow the reply at the bottom instead."
        >
          <Switch
            aria-label="Pin minimal view sent message"
            checked={pinSentMessage}
            onCheckedChange={setPinSentMessage}
          />
        </SettingsRow>
      )}
    </SettingsGroup>
  );
}
