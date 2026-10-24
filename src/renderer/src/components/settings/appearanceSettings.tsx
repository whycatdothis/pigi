import { IconCheck } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { THEME_ACCENTS, findThemeAccent } from '../../lib/themeAccents';
import { PIGI_THEMES } from '../../../../shared/pigiSettings';
import type { ThemeMode } from '../../../../shared/appearance';
import { SettingsGroup, SettingsRow, SegmentedControl } from './settingsControls';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const THEME_OPTIONS = PIGI_THEMES.map((theme) => ({ value: theme, label: THEME_LABELS[theme] }));

export function AppearanceSettings(): React.JSX.Element {
  const mode = useSettingsStore((state) => state.appearance.mode);
  const accent = useSettingsStore((state) => {
    const slot = state.appearance.light;
    return 'presetId' in slot.accent ? slot.accent.presetId : null;
  });
  const setMode = useSettingsStore((state) => state.setMode);
  const setAccent = useSettingsStore((state) => state.setAccent);

  const accentPreset = findThemeAccent(accent ?? '');

  return (
    <SettingsGroup>
      <SettingsRow label="Theme">
        <SegmentedControl value={mode} options={THEME_OPTIONS} onChange={setMode} />
      </SettingsRow>

      <SettingsRow label="Accent color">
        <Popover>
          <PopoverTrigger
            data-testid="accent-trigger"
            aria-label={`Accent color: ${accentPreset.name}`}
            className="flex items-center justify-center rounded-full transition-transform outline-hidden hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span
              className="size-6 rounded-full"
              style={{ backgroundColor: accentPreset.swatchHex }}
            />
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
                  onClick={() => setAccent({ presetId: option.id })}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: option.swatchHex }}
                >
                  {option.id === accentPreset.id && (
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
