import { IconCheck } from '@tabler/icons-react';
import { useSettingsStore } from '../../state/settingsStore';
import { THEME_ACCENTS } from '../../lib/themeAccents';
import { PIGI_THEMES, type PigiTheme } from '../../../../shared/pigiSettings';
import { SettingsGroup } from './settingsControls';
import { cn } from '@/lib/utils';

const THEME_LABELS: Record<PigiTheme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const THEME_PREVIEW_CLASS: Record<PigiTheme, string> = {
  system: 'bg-[linear-gradient(90deg,#ffffff_50%,#171717_50%)]',
  light: 'bg-white',
  dark: 'bg-neutral-900',
};

export function AppearanceSettings(): React.JSX.Element {
  const theme = useSettingsStore((state) => state.theme);
  const accentId = useSettingsStore((state) => state.accentId);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setAccentId = useSettingsStore((state) => state.setAccentId);

  return (
    <>
      <SettingsGroup title="Theme">
        <div className="grid grid-cols-3 gap-2 p-3">
          {PIGI_THEMES.map((option) => {
            const active = option === theme;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setTheme(option)}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border-[0.5px] p-2 text-left transition-colors',
                  active
                    ? 'border-[var(--system-accent)] ring-1 ring-[var(--system-accent)]'
                    : 'border-foreground/15 hover:border-foreground/30',
                )}
              >
                <div
                  className={cn(
                    'h-14 w-full rounded-md border-[0.5px] border-foreground/15',
                    THEME_PREVIEW_CLASS[option],
                  )}
                />
                <span className="flex items-center gap-1.5 text-xs text-foreground">
                  {THEME_LABELS[option]}
                  {active && <IconCheck size={13} className="text-[var(--system-accent)]" />}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Accent color">
        <div className="flex flex-wrap gap-2 p-3">
          {THEME_ACCENTS.map((accent) => {
            const active = accent.id === accentId;
            return (
              <button
                key={accent.id}
                type="button"
                title={accent.name}
                aria-label={accent.name}
                aria-pressed={active}
                onClick={() => setAccentId(accent.id)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full transition-transform',
                  active
                    ? 'ring-2 ring-[var(--system-accent)] ring-offset-2 ring-offset-background'
                    : 'hover:scale-110',
                )}
                style={{ backgroundColor: accent.hex }}
              >
                {active && <IconCheck size={14} className="text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </SettingsGroup>
    </>
  );
}
