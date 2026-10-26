import { IconChevronDown } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { TOOL_BLOCK_VIEW_MODES, type ToolBlockViewMode } from '../../../../shared/pigiSettings';
import { DIAGRAM_THEME_CHOICES, isDiagramThemeChoice } from '../../../../shared/diagramTheme';
import { NativeSelect } from '../ui/native-select';
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
  const diagramTheme = useSettingsStore((state) => state.chat.diagramTheme);
  const setDiagramTheme = useSettingsStore((state) => state.setDiagramTheme);

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
      <SettingsRow label="Diagram theme" description="The mermaid theme diagrams are drawn in.">
        <NativeSelect
          size="sm"
          aria-label="Diagram theme"
          value={diagramTheme}
          onChange={(event) => {
            if (isDiagramThemeChoice(event.target.value)) {
              setDiagramTheme(event.target.value);
            }
          }}
          icon={<IconChevronDown size={14} stroke={1.75} />}
          className="w-[10rem] [&_select]:pr-7 [&_select]:text-caption [&_select]:dark:bg-transparent"
        >
          {DIAGRAM_THEME_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </NativeSelect>
      </SettingsRow>
    </SettingsGroup>
  );
}
