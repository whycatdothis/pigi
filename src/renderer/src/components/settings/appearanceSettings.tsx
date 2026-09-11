import { IconCheck } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { THEME_ACCENTS, findThemeAccent } from '../../lib/themeAccents';
import { PIGI_THEMES, type PigiTheme } from '../../../../shared/pigiSettings';
import { SettingsGroup, SettingsRow, SegmentedControl } from './settingsControls';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const THEME_LABELS: Record<PigiTheme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const THEME_OPTIONS = PIGI_THEMES.map((theme) => ({ value: theme, label: THEME_LABELS[theme] }));

export function AppearanceSettings(): React.JSX.Element {
  const theme = useSettingsStore((state) => state.theme);
  const accentId = useSettingsStore((state) => state.accentId);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setAccentId = useSettingsStore((state) => state.setAccentId);

  const accent = findThemeAccent(accentId);

  return (
    <SettingsGroup>
      <SettingsRow label="Theme">
        <SegmentedControl value={theme} options={THEME_OPTIONS} onChange={setTheme} />
      </SettingsRow>

      <SettingsRow label="Accent color">
        <Popover>
          <PopoverTrigger
            data-testid="accent-trigger"
            aria-label={`Accent color: ${accent.name}`}
            className="flex items-center justify-center rounded-full transition-transform outline-hidden hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="size-6 rounded-full" style={{ backgroundColor: accent.hex }} />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" sideOffset={6} className="w-auto p-2">
            <div className="flex items-center gap-2">
              {THEME_ACCENTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`accent-option-${option.id}`}
                  aria-label={option.name}
                  title={option.name}
                  onClick={() => setAccentId(option.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: option.hex }}
                >
                  {option.id === accent.id && (
                    <IconCheck size={15} stroke={3} className="text-white" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </SettingsRow>
    </SettingsGroup>
  );
}
