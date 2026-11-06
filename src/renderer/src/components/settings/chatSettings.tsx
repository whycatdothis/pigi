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
      <SettingsRow
        label="Pin sent message"
        description="Minimal view: keep a sent message at the top while the reply comes in."
      >
        <Switch
          aria-label="Pin sent message"
          checked={pinSentMessage}
          onCheckedChange={setPinSentMessage}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
