/**
 * Diagram theme: the picker, with the message's own mermaid block under it so
 * the choice is made against the palette it produces.
 */
import { IconChevronDown } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { DIAGRAM_THEME_CHOICES, isDiagramThemeChoice } from '../../../../shared/diagramTheme';
import MermaidDiagram from '../message/mermaidDiagram';
import { NativeSelect } from '../ui/native-select';
import { SettingsRow } from './settingsControls';

const SAMPLE_DIAGRAM = `flowchart LR
  ask[ask] --> plan[plan]
  plan --> run[run]
  run --> ask`;

export function DiagramThemeSettings(): React.JSX.Element {
  const diagramTheme = useSettingsStore((state) => state.appearance.diagramTheme);
  const setDiagramTheme = useSettingsStore((state) => state.setDiagramTheme);

  return (
    // One block, so the card's row divider does not cut off the specimen.
    <div>
      <SettingsRow label="Diagram theme">
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
      <div className="px-5 pb-5" data-testid="diagram-theme-preview">
        <div className="markdown-body">
          <div className="markdown-code-block">
            <MermaidDiagram code={SAMPLE_DIAGRAM} />
          </div>
        </div>
      </div>
    </div>
  );
}
