/**
 * Code-block and diagram style: each picker is followed by the thing it draws,
 * rendered by the same components a message uses.
 */
import { IconChevronDown } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { CODE_THEME_PRESETS } from '../../../../shared/codeTheme';
import { DIAGRAM_THEME_CHOICES, isDiagramThemeChoice } from '../../../../shared/diagramTheme';
import MermaidDiagram from '../message/mermaidDiagram';
import SyntaxHighlightedCode from '../message/syntaxHighlightedCode';
import { NativeSelect } from '../ui/native-select';
import { SettingsRow } from './settingsControls';

const SAMPLE_CODE = `import { readFile } from 'node:fs/promises';

export async function loadSettings(path: string) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}`;

const SAMPLE_DIAGRAM = `flowchart LR
  ask[ask] --> plan[plan]
  plan --> run[run]
  run --> ask`;

export function CodeStyleSettings(): React.JSX.Element {
  const codeTheme = useSettingsStore((state) => state.appearance.codeTheme);
  const setCodeTheme = useSettingsStore((state) => state.setCodeTheme);
  const diagramTheme = useSettingsStore((state) => state.appearance.diagramTheme);
  const setDiagramTheme = useSettingsStore((state) => state.setDiagramTheme);

  return (
    <>
      {/* One setting and its specimen per block, so the card's divider lands
          between the two settings rather than between a setting and its preview. */}
      <div>
        <SettingsRow label="Code theme">
          <NativeSelect
            size="sm"
            aria-label="Code theme"
            value={codeTheme}
            onChange={(event) => setCodeTheme(event.target.value)}
            icon={<IconChevronDown size={14} stroke={1.75} />}
            className="w-[9rem] [&_select]:pr-7 [&_select]:text-caption [&_select]:dark:bg-transparent"
          >
            {CODE_THEME_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </NativeSelect>
        </SettingsRow>
        <div className="px-5 pb-5" data-testid="code-theme-preview">
          <div className="markdown-body">
            <div className="markdown-code-block">
              <div className="markdown-code-header" data-search-ignore>
                <span className="markdown-code-label">TypeScript</span>
              </div>
              <pre>
                <SyntaxHighlightedCode code={SAMPLE_CODE} language="ts" />
              </pre>
            </div>
          </div>
        </div>
      </div>

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
    </>
  );
}
