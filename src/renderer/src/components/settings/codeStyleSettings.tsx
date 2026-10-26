/**
 * A message's code block and diagram, drawn with the current style choices.
 *
 * The pickers above it are the settings; this is what they mean. Rendering the
 * real components on a fixed snippet is the difference between choosing "Nord"
 * from a word and seeing it.
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
      <SettingsRow label="Code theme" description="Highlighting for code blocks and tool output.">
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
      <SettingsRow label="Diagram theme" description="The palette mermaid draws in.">
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
      {/* The specimen: the same components a message uses, on a fixed sample. */}
      <div className="flex flex-col gap-2 px-5 py-4" data-testid="code-style-preview">
        <span className="text-caption text-muted-foreground">
          Preview — how a message draws its code and diagrams.
        </span>
        <div className="markdown-body flex flex-wrap items-start gap-3">
          <div className="markdown-code-block min-w-0 flex-1">
            <div className="markdown-code-header" data-search-ignore>
              <span className="markdown-code-label">TypeScript</span>
            </div>
            <pre>
              <SyntaxHighlightedCode code={SAMPLE_CODE} language="ts" />
            </pre>
          </div>
          <div className="w-[15rem] shrink-0">
            <MermaidDiagram code={SAMPLE_DIAGRAM} />
          </div>
        </div>
      </div>
    </>
  );
}
