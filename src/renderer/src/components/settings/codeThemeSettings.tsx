/**
 * Code theme: the picker, with the message's own code block under it so the
 * choice is made against its result rather than against a theme name.
 */
import { IconChevronDown } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { CODE_THEME_PRESETS } from '../../../../shared/codeTheme';
import SyntaxHighlightedCode from '../message/syntaxHighlightedCode';
import { NativeSelect } from '../ui/native-select';
import { SettingsRow } from './settingsControls';

const SAMPLE_CODE = `import { readFile } from 'node:fs/promises';

export async function loadSettings(path: string) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}`;

export function CodeThemeSettings(): React.JSX.Element {
  const codeTheme = useSettingsStore((state) => state.appearance.codeTheme);
  const setCodeTheme = useSettingsStore((state) => state.setCodeTheme);

  return (
    // One block, so the card's row divider does not cut off the specimen.
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
  );
}
