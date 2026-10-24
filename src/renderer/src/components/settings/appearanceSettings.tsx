/**
 * The Appearance page.
 *
 * Reads the persisted appearance, edits the resolved slot (the light slot while
 * modes are shared, the selected one once they are separate), and lets the
 * store persist + apply on every change. Nothing here writes CSS directly.
 */
import { useState } from 'react';
import { useSettingsStore } from '../../state/settingsStore';
import { readSystemEnvironment } from '../../appearance/applyAppearance';
import {
  REDUCE_MOTION_VALUES,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  CODE_FONT_SIZE_MAX,
  CODE_FONT_SIZE_MIN,
  ACCENT_PRESETS,
  type AccentChoice,
  type ColorMode,
  type ReduceMotion,
  type ThemeMode,
} from '../../../../shared/appearance';
import {
  DEFAULT_MODE_COLORS,
  resolveAppearance,
  resolvedSecondaryContrast,
} from '../../../../shared/appearanceTokens';
import { SettingsGroup, SettingsRow, SegmentedControl } from './settingsControls';
import {
  AccentField,
  ColorField,
  FontPicker,
  ModePreviewPicker,
  NumberStepper,
  SettingSwitch,
  SliderField,
} from './appearanceControls';

const REDUCE_MOTION_LABELS: Record<ReduceMotion, string> = {
  system: 'System',
  on: 'On',
  off: 'Off',
};

const REDUCE_MOTION_OPTIONS = REDUCE_MOTION_VALUES.map((value) => ({
  value,
  label: REDUCE_MOTION_LABELS[value],
}));

const MODE_OPTIONS: readonly { value: ColorMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceSettings(): React.JSX.Element {
  const appearance = useSettingsStore((state) => state.appearance);
  const updateAppearance = useSettingsStore((state) => state.updateAppearance);
  const resetAppearance = useSettingsStore((state) => state.resetAppearance);
  // Which slot the page edits. Ephemeral: it defaults to the mode in effect,
  // and the page never flips the app theme just to preview the other one.
  const [editingMode, setEditingMode] = useState<ColorMode | null>(null);

  const resolved = resolveAppearance(appearance, readSystemEnvironment());
  const targetMode: ColorMode = appearance.separateModes ? (editingMode ?? resolved.mode) : 'light';
  const slot = appearance[targetMode];
  // With shared modes the light slot is authoritative, but its null colors
  // resolve to the *active* mode's defaults, so the swatch has to show those.
  const defaults = DEFAULT_MODE_COLORS[appearance.separateModes ? targetMode : resolved.mode];
  const contrastTarget = resolvedSecondaryContrast(resolved);

  function patchSlot(patch: Partial<typeof slot>): void {
    updateAppearance((current) => ({
      ...current,
      [targetMode]: { ...current[targetMode], ...patch },
    }));
  }

  function patchFonts(patch: Partial<typeof slot.fonts>): void {
    patchSlot({ fonts: { ...slot.fonts, ...patch } });
  }

  function changeAccent(accent: AccentChoice): void {
    patchSlot({ accent });
  }

  return (
    <>
      <SettingsGroup title="Theme" description="Applies immediately.">
        <SettingsRow label="Mode">
          <ModePreviewPicker
            value={appearance.mode}
            appearance={appearance}
            onChange={(mode: ThemeMode) => updateAppearance((current) => ({ ...current, mode }))}
          />
        </SettingsRow>
        <SettingsRow label="Accent">
          <AccentField accent={slot.accent} presets={ACCENT_PRESETS} onChange={changeAccent} />
        </SettingsRow>
        <SettingsRow
          label="Background"
          description={slot.background ? undefined : 'Default for this mode'}
        >
          <ColorField
            label="Background"
            value={slot.background}
            fallback={defaults.background}
            onChange={(background) => patchSlot({ background })}
          />
        </SettingsRow>
        <SettingsRow
          label="Foreground"
          description={slot.foreground ? undefined : 'Default for this mode'}
        >
          <ColorField
            label="Foreground"
            value={slot.foreground}
            fallback={defaults.foreground}
            onChange={(foreground) => patchSlot({ foreground })}
          />
        </SettingsRow>
        <SettingsRow label="Contrast" description="Text contrast against the backgrounds.">
          <SliderField
            label="Contrast"
            value={slot.contrast}
            min={0}
            max={100}
            display={`${slot.contrast} · ${contrastTarget.toFixed(1)}:1`}
            onChange={(contrast) => patchSlot({ contrast })}
          />
        </SettingsRow>
        <SettingSwitch
          label="Separate light and dark modes"
          description="Configure each mode independently."
          checked={appearance.separateModes}
          onChange={(separateModes) =>
            updateAppearance((current) => ({ ...current, separateModes }))
          }
        />
        {appearance.separateModes && (
          <SettingsRow label="Editing">
            <SegmentedControl value={targetMode} options={MODE_OPTIONS} onChange={setEditingMode} />
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="Typography">
        <SettingsRow label="Font" description="Chat text.">
          <FontPicker
            role="content"
            label="Content font"
            value={slot.fonts.content}
            onChange={(content) => patchFonts({ content })}
          />
        </SettingsRow>
        <SettingsRow label="UI font" description="Sidebar, settings, and controls.">
          <FontPicker
            role="ui"
            label="UI font"
            value={slot.fonts.ui}
            onChange={(ui) => patchFonts({ ui })}
          />
        </SettingsRow>
        <SettingsRow label="UI font size">
          <NumberStepper
            label="UI font size"
            suffix="px"
            value={slot.fonts.uiSize}
            min={UI_FONT_SIZE_MIN}
            max={UI_FONT_SIZE_MAX}
            onChange={(uiSize) => patchFonts({ uiSize })}
          />
        </SettingsRow>
        <SettingsRow label="Code font" description="Code blocks and the terminal.">
          <FontPicker
            role="code"
            label="Code font"
            value={slot.fonts.code}
            onChange={(code) => patchFonts({ code })}
          />
        </SettingsRow>
        <SettingsRow label="Code font size">
          <NumberStepper
            label="Code font size"
            suffix="px"
            value={slot.fonts.codeSize}
            min={CODE_FONT_SIZE_MIN}
            max={CODE_FONT_SIZE_MAX}
            onChange={(codeSize) => patchFonts({ codeSize })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Details">
        <SettingSwitch
          label="Translucent sidebar"
          description="Let the window material show through the sidebar."
          checked={slot.translucentSidebar}
          onChange={(translucentSidebar) => patchSlot({ translucentSidebar })}
        />
        <SettingSwitch
          label="Font smoothing"
          description="Use grayscale antialiasing for lighter text."
          checked={appearance.fontSmoothing}
          onChange={(fontSmoothing) =>
            updateAppearance((current) => ({ ...current, fontSmoothing }))
          }
        />
        <SettingsRow label="Reduce motion" description="Follow the system setting or force it.">
          <SegmentedControl
            value={appearance.reduceMotion}
            options={REDUCE_MOTION_OPTIONS}
            onChange={(reduceMotion) =>
              updateAppearance((current) => ({ ...current, reduceMotion }))
            }
          />
        </SettingsRow>
      </SettingsGroup>

      <div className="flex items-center justify-end gap-3 px-1">
        <button
          type="button"
          onClick={resetAppearance}
          className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Reset appearance
        </button>
      </div>
    </>
  );
}
