import { useSettingsStore } from '../../state/settingsStore';
import { TOOL_BLOCK_VIEW_MODES, type ToolBlockViewMode } from '../../../../shared/pigiSettings';
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

  return (
    <SettingsGroup>
      <SettingsRow
        label="Default view"
        description="How tool calls are rendered in the transcript. Also switchable from the session toolbar."
      >
        <SegmentedControl
          value={toolBlockViewMode}
          options={TOOL_BLOCK_VIEW_MODES.map((mode) => ({
            value: mode,
            label: VIEW_MODE_LABELS[mode],
          }))}
          onChange={setToolBlockViewMode}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
