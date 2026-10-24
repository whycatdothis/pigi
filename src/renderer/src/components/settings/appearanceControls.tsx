/**
 * Controls for the Appearance page.
 *
 * Everything here is presentational: values in, callbacks out. The page owns
 * the store writes, so a control never has to know which mode slot it edits.
 */
import { useId, useMemo, useState } from 'react';
import { IconCheck, IconMinus, IconPlus } from '@tabler/icons-react';
import { NativeSelect } from '../ui/native-select';
import { Switch } from '../ui/switch';
import { cn } from '@/lib/utils';
import {
  FONT_FAMILIES,
  fontStackFor,
  type AccentChoice,
  type ColorMode,
  type FontRole,
  type ThemeMode,
} from '../../../../shared/appearance';
import { deriveTokens, resolveAppearance } from '../../../../shared/appearanceTokens';
import type { AppearanceSettings } from '../../../../shared/appearance';
import { formatHex, normalizeHexColor, parseCssColor } from '../../../../shared/colorMath';
import type { ThemeAccent } from '../../../../shared/appearance';

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
    <div className="flex items-center gap-2">
      <label
        htmlFor={inputId}
        aria-label={`${label} color picker`}
        className="relative size-6 shrink-0 cursor-pointer rounded-md ring-1 ring-foreground/15 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        style={{ backgroundColor: hex }}
      >
        <input
          id={inputId}
          type="color"
          value={hex}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
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
        className="h-6 w-20 rounded-md border-[0.5px] border-foreground/15 bg-transparent px-1.5 font-mono text-xs text-foreground uppercase outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
    </div>
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
              'flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110',
              selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
            )}
            style={{ backgroundColor: preset.swatchHex }}
          >
            {selected && <IconCheck size={13} stroke={3} className="text-white" />}
          </button>
        );
      })}
      <label
        htmlFor={inputId}
        title="Custom color"
        aria-label="Custom accent color"
        className={cn(
          'relative flex size-6 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
          selectedId === null && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
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
          className="pointer-events-none size-3 rounded-full ring-1 ring-black/20"
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
      <span className="w-24 shrink-0 text-right font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
        {display}
      </span>
    </div>
  );
}

export function NumberStepper({
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
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <IconMinus size={12} stroke={2.5} />
      </button>
      <span className="w-10 text-center font-mono text-xs tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <IconPlus size={12} stroke={2.5} />
      </button>
      <span className="text-xs text-muted-foreground">{suffix}</span>
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
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="w-6 shrink-0 text-center text-sm text-foreground"
        style={{ fontFamily: fontStackFor(role, value) }}
      >
        Aa
      </span>
      <NativeSelect
        size="sm"
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        className="w-40"
      >
        <option value="">{role === 'code' ? 'System mono' : 'System'}</option>
        {FONT_FAMILIES.map((family) => (
          <option key={family} value={family}>
            {family}
          </option>
        ))}
      </NativeSelect>
    </div>
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
    <div role="radiogroup" aria-label="Theme" className="flex items-center gap-2">
      {PREVIEW_MODES.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            data-testid={`theme-option-${option.value}`}
            onClick={() => onChange(option.value)}
            className={cn(
              // The ring hugs the preview with the same radius, so the two
              // curves coincide instead of leaving an uneven corner gap.
              'rounded-md transition-colors',
              selected ? 'ring-2 ring-ring' : 'hover:ring-1 hover:ring-foreground/20',
            )}
          >
            <span
              className={cn(
                'flex h-12 w-16 overflow-hidden rounded-md',
                // A hairline keeps the light preview readable on a white row;
                // the selection ring replaces it when the preview is chosen.
                !selected && 'outline-1 -outline-offset-1 outline-foreground/20',
              )}
            >
              {option.value === 'system' ? (
                <>
                  <PreviewPane tokens={previews.light} />
                  <PreviewPane tokens={previews.dark} />
                </>
              ) : (
                <PreviewPane tokens={previews[option.value]} />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PreviewPane({ tokens }: { tokens: Record<string, string> }): React.JSX.Element {
  return (
    <span
      className="flex h-full flex-1 flex-col justify-center gap-[3px] px-1.5"
      style={{ backgroundColor: tokens['--app-background'] }}
    >
      <span
        className="h-[2px] w-4/5 rounded-full"
        style={{ backgroundColor: tokens['--app-foreground'] }}
      />
      <span
        className="h-[2px] w-3/5 rounded-full"
        style={{ backgroundColor: tokens['--app-muted-foreground'] }}
      />
      <span
        className="h-[2px] w-1/3 rounded-full"
        style={{ backgroundColor: tokens['--app-system-accent'] }}
      />
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
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
