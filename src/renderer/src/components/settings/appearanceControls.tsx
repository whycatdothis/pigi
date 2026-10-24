/**
 * Controls for the Appearance page.
 *
 * Everything here is presentational: values in, callbacks out. The page owns
 * the store writes, so a control never has to know which mode slot it edits.
 */
import { useId, useMemo, useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { NativeSelect } from '../ui/native-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Switch } from '../ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import {
  FONT_FAMILIES,
  type AccentChoice,
  type ColorMode,
  type FontRole,
  type ThemeMode,
} from '../../../../shared/appearance';
import { deriveTokens, resolveAppearance } from '../../../../shared/appearanceTokens';
import type { AppearanceSettings } from '../../../../shared/appearance';
import { formatHex, normalizeHexColor, parseCssColor } from '../../../../shared/colorMath';
import type { ThemeAccent } from '../../../../shared/appearance';
import { THEME_PRESETS, accentSwatchHex } from '../../../../shared/themePresets';

/** Any CSS color from the engine, as a `#rrggbb` the color input accepts. */
function toHex(value: string | null, fallback: string): string {
  const parsed = parseCssColor(value ?? '') ?? parseCssColor(fallback);
  return parsed ? formatHex(parsed) : '#000000';
}

export function ColorField({
  value,
  fallback,
  label,
  onChange,
}: {
  value: string | null;
  fallback: string;
  label: string;
  onChange: (hex: string) => void;
}): React.JSX.Element {
  const inputId = useId();
  const hex = toHex(value, fallback);
  const [draft, setDraft] = useState(hex);
  const [lastHex, setLastHex] = useState(hex);

  if (hex !== lastHex) {
    setLastHex(hex);
    setDraft(hex);
  }

  function commit(): void {
    const normalized = normalizeHexColor(draft);
    if (normalized === null) {
      setDraft(hex);
      return;
    }
    setDraft(normalized);
    if (normalized !== hex) {
      onChange(normalized);
    }
  }

  return (
    <label
      className="flex h-7 items-center gap-2 rounded-lg border border-input pr-2 pl-1.5 transition-colors focus-within:border-ring hover:bg-muted/60 dark:bg-input/30"
      htmlFor={inputId}
    >
      <span
        className="relative size-3.5 shrink-0 cursor-pointer rounded-full ring-1 ring-foreground/15 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        style={{ backgroundColor: hex }}
      >
        <input
          id={inputId}
          type="color"
          value={hex}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} color picker`}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setDraft(hex);
          }
        }}
        spellCheck={false}
        aria-label={`${label} hex value`}
        className="w-[4.25rem] bg-transparent p-0 font-mono text-caption uppercase tabular-nums text-foreground outline-none"
      />
    </label>
  );
}

/**
 * Accent: one click per preset, plus a native picker for a custom color. The
 * stored value is the preset id (so the tuned per-mode colors survive) unless
 * the user picks a custom hex.
 */
export function AccentField({
  accent,
  presets,
  onChange,
}: {
  accent: AccentChoice;
  presets: readonly ThemeAccent[];
  onChange: (accent: AccentChoice) => void;
}): React.JSX.Element {
  const inputId = useId();
  const selectedId = 'presetId' in accent ? accent.presetId : null;
  const customHex = 'hex' in accent ? toHex(accent.hex, '#6366f1') : null;
  const customColor = customHex ?? '#6366f1';

  return (
    <div className="flex items-center gap-1.5">
      {presets.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <button
            key={preset.id}
            type="button"
            aria-label={preset.name}
            aria-pressed={selected}
            title={preset.name}
            data-testid={`accent-option-${preset.id}`}
            onClick={() => onChange({ presetId: preset.id })}
            className={cn(
              'flex size-5 items-center justify-center rounded-full transition-transform hover:scale-110',
              selected && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
            )}
            style={{ backgroundColor: preset.swatchHex }}
          >
            {selected && <IconCheck size={11} stroke={3} className="text-white" />}
          </button>
        );
      })}
      <label
        htmlFor={inputId}
        title="Custom color"
        aria-label="Custom accent color"
        className={cn(
          'relative flex size-5 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
          selectedId === null && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
        )}
        style={{
          background:
            'conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #38bdf8, #a78bfa, #f87171)',
        }}
      >
        <input
          id={inputId}
          type="color"
          value={customColor}
          onChange={(event) => onChange({ hex: event.target.value })}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span
          className="pointer-events-none size-2.5 rounded-full ring-1 ring-black/20"
          style={{ backgroundColor: customHex ?? 'transparent' }}
        />
      </label>
    </div>
  );
}

export function SliderField({
  value,
  min,
  max,
  label,
  display,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  display: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="appearance-slider h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <span className="w-24 shrink-0 text-right font-mono text-caption whitespace-nowrap tabular-nums text-muted-foreground">
        {display}
      </span>
    </div>
  );
}

/**
 * A single editable number, the way the rest of the page shows values: a small
 * bordered field plus the unit outside it. The draft is local so a half-typed
 * number never reaches the store; blur or Enter clamps and commits.
 */
export function NumberInput({
  value,
  min,
  max,
  label,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  suffix: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  function commit(): void {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setDraft(String(value));
          }
        }}
        inputMode="numeric"
        aria-label={label}
        className="h-7 w-12 rounded-lg border border-input bg-transparent text-center text-caption tabular-nums outline-none transition-colors focus-visible:border-ring dark:bg-input/30"
      />
      <span className="text-caption text-muted-foreground">{suffix}</span>
    </div>
  );
}

export function FontPicker({
  role,
  value,
  label,
  onChange,
}: {
  role: FontRole;
  value: string | null;
  label: string;
  onChange: (value: string | null) => void;
}): React.JSX.Element {
  return (
    <NativeSelect
      size="sm"
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      icon={<IconChevronDown size={14} stroke={1.75} />}
      className="w-[8.5rem] [&_select]:pr-7 [&_select]:text-caption [&_select]:text-right [&_select]:dark:bg-transparent"
    >
      <option value="">{role === 'code' ? 'System mono' : 'System'}</option>
      {FONT_FAMILIES.map((family) => (
        <option key={family} value={family}>
          {family}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Small `Aa` tile tinted with a theme's accent, as in the theme menu. */
function ThemeBadge({ accent }: { accent: AccentChoice }): React.JSX.Element {
  const hex = accentSwatchHex(accent);
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-medium"
      style={{ color: hex, backgroundColor: `${hex}1f` }}
    >
      Aa
    </span>
  );
}

/**
 * Named theme menu. A theme sets both mode slots' colors at once; the current
 * one is matched from the stored colors, so it reads "Custom" as soon as any
 * color is edited.
 */
export function ThemePresetField({
  presetId,
  accent,
  onChange,
}: {
  presetId: string;
  /** The slot's accent, used for the badge when the look is custom. */
  accent: AccentChoice;
  onChange: (id: string) => void;
}): React.JSX.Element {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === presetId) ?? THEME_PRESETS[0];
  const isCustom = preset.id !== presetId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Theme"
          className="flex h-8 w-52 items-center gap-2 rounded-lg border border-input px-2 text-left outline-none transition-colors hover:bg-muted data-[state=open]:bg-muted dark:bg-input/30"
        >
          <ThemeBadge accent={isCustom ? accent : preset.light.accent} />
          <span className="flex-1 truncate text-caption text-foreground">
            {isCustom ? 'Custom' : preset.name}
          </span>
          <IconChevronDown size={14} className="shrink-0 text-muted-foreground" stroke={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {THEME_PRESETS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => onChange(option.id)}
            className="gap-2.5 text-caption"
          >
            <ThemeBadge accent={option.light.accent} />
            <span className="flex-1">{option.name}</span>
            {option.id === presetId && <IconCheck size={14} stroke={2} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PREVIEW_MODES: readonly { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Three miniature windows drawn from the tokens each mode would apply, so the
 * preview reflects custom colors instead of shipping a picture of the theme.
 */
export function ModePreviewPicker({
  value,
  appearance,
  onChange,
}: {
  value: ThemeMode;
  appearance: AppearanceSettings;
  onChange: (value: ThemeMode) => void;
}): React.JSX.Element {
  const previews = useMemo(() => {
    const forMode = (mode: ColorMode): Record<string, string> =>
      deriveTokens(
        resolveAppearance(
          { ...appearance, mode, separateModes: true },
          { systemIsDark: mode === 'dark', systemPrefersReducedMotion: false },
        ),
      );
    return { light: forMode('light'), dark: forMode('dark') };
  }, [appearance]);

  return (
    <TooltipProvider delayDuration={200}>
      <div role="radiogroup" aria-label="Theme" className="flex items-center gap-4">
        {PREVIEW_MODES.map((option) => {
          const selected = option.value === value;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.label}
                  data-testid={`theme-option-${option.value}`}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    // The preview carries the selection in its own border, so
                    // there is no second outline around a rounded shape.
                    'rounded-[16px] border-2 transition-colors',
                    selected
                      ? 'border-[var(--app-system-accent)]'
                      : 'border-foreground/20 hover:border-foreground/35',
                  )}
                >
                  <span
                    className="flex h-12 w-16 overflow-hidden rounded-[14px]"
                    // Painted on this element so the border and the inner
                    // radius share one corner.
                    style={{ background: previewBackground(option.value, previews) }}
                  >
                    {option.value === 'system' ? (
                      <>
                        <PreviewPane tokens={previews.light} />
                        <PreviewPane tokens={previews.dark} sidebar={false} />
                      </>
                    ) : (
                      <PreviewPane tokens={previews[option.value]} />
                    )}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{option.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function previewBackground(
  mode: ThemeMode,
  previews: Record<ColorMode, Record<string, string>>,
): string {
  if (mode === 'system') {
    const light = previews.light['--app-background'];
    const dark = previews.dark['--app-background'];
    return `linear-gradient(90deg, ${light} 0 50%, ${dark} 50% 100%)`;
  }
  return previews[mode]['--app-background'];
}

/**
 * One half of a preview: a window with an optional sidebar, two text lines, and
 * the composer at the bottom. The system preview draws the sidebar once, on the
 * light half, so the split reads as one window instead of two.
 */
function PreviewPane({
  tokens,
  sidebar = true,
}: {
  tokens: Record<string, string>;
  sidebar?: boolean;
}): React.JSX.Element {
  return (
    <span
      className="flex h-full min-w-0 flex-1"
      style={{ backgroundColor: tokens['--app-background'] }}
    >
      {sidebar && (
        <span
          className="flex w-[24%] flex-col gap-[2px] p-[3px]"
          style={{ backgroundColor: tokens['--app-sidebar'] }}
        >
          <span
            className="h-[2px] w-3/4 rounded-full"
            style={{ backgroundColor: tokens['--app-muted-foreground'] }}
          />
          <span
            className="h-[2px] w-1/2 rounded-full"
            style={{ backgroundColor: tokens['--app-muted-foreground'] }}
          />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px] p-[4px]">
        <span
          className="h-[2.5px] w-full rounded-full"
          style={{ backgroundColor: tokens['--app-foreground'] }}
        />
        <span
          className="h-[2.5px] w-3/5 rounded-full"
          style={{ backgroundColor: tokens['--app-muted-foreground'] }}
        />
        <span
          className="mt-auto h-[10px] w-full rounded-[4px] border"
          style={{
            backgroundColor: tokens['--app-card'],
            borderColor: tokens['--app-system-accent'],
          }}
        />
      </span>
    </span>
  );
}

export function SettingSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 px-5">
      <span className="min-w-0 truncate text-ui font-medium text-foreground">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
