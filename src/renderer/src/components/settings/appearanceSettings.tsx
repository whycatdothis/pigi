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
  type ModeAppearance,
  type ReduceMotion,
  type ThemeMode,
} from '../../../../shared/appearance';
import {
  DEFAULT_MODE_COLORS,
  resolveAppearance,
  resolvedSecondaryContrast,
} from '../../../../shared/appearanceTokens';
import { SettingsCard, SettingsGroup, SettingsRow, SegmentedControl } from './settingsControls';
import { ThemeFileActions } from './themeFileActions';
import { CodeThemeSettings } from './codeThemeSettings';
import { DiagramThemeSettings } from './diagramThemeSettings';
import {
  AccentField,
  ColorField,
  FontPicker,
  ModePreviewPicker,
  NumberInput,
  SettingSwitch,
  SliderField,
  ThemePresetField,
} from './appearanceControls';
import { THEME_PRESETS, applyThemePreset, matchThemePreset } from '../../../../shared/themePresets';

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
  // The ratio belongs to the slot being edited, which is not the slot in effect
  // when separate modes are on and the page shows the other one.
  const contrastTarget =
    targetMode === resolved.mode
      ? resolvedSecondaryContrast(resolved)
      : resolvedSecondaryContrast(
          resolveAppearance({ ...appearance, mode: targetMode }, readSystemEnvironment()),
        );

  function patchSlot(patch: Partial<typeof slot>): void {
    updateAppearance((current) => {
      const next = (mode: ColorMode): ModeAppearance => ({ ...current[mode], ...patch });
      if (current.separateModes) {
        return { ...current, [targetMode]: next(targetMode) };
      }
      // One palette: keep the dormant slot in sync, otherwise the Dark preview
      // and the app's dark derivation would keep the previous colors.
      return { ...current, light: next('light'), dark: next('dark') };
    });
  }

  function patchFonts(patch: Partial<typeof slot.fonts>): void {
    patchSlot({ fonts: { ...slot.fonts, ...patch } });
  }

  function changeAccent(accent: AccentChoice): void {
    // The accent is one brand choice, not a per-mode color: it applies to both
    // slots so the mode previews always move together. Each mode still clamps
    // the same choice into its own legible lightness range when deriving.
    updateAppearance((current) => ({
      ...current,
      light: { ...current.light, accent },
      dark: { ...current.dark, accent },
    }));
  }

  return (
    <>
      <SettingsGroup title="Visual style" separateCards>
        <SettingsCard>
          <SettingsRow label="Mode" className="py-1.5">
            <ModePreviewPicker
              value={appearance.mode}
              appearance={appearance}
              onChange={(mode: ThemeMode) => updateAppearance((current) => ({ ...current, mode }))}
            />
          </SettingsRow>
        </SettingsCard>
        <SettingsCard>
          <SettingsRow label="Theme">
            <div className="flex items-center gap-2">
              <ThemeFileActions />
              <ThemePresetField
                presetId={matchThemePreset(slot, targetMode)?.id ?? 'custom'}
                accent={slot.accent}
                onChange={(id) => {
                  const preset = THEME_PRESETS.find((candidate) => candidate.id === id);
                  if (preset === undefined) return;
                  updateAppearance((current) => applyThemePreset(current, preset));
                }}
              />
            </div>
          </SettingsRow>
          <SettingsRow label="Accent">
            <AccentField accent={slot.accent} presets={ACCENT_PRESETS} onChange={changeAccent} />
          </SettingsRow>
          <SettingsRow label="Background">
            <ColorField
              label="Background"
              value={slot.background}
              fallback={defaults.background}
              onChange={(background) => patchSlot({ background })}
            />
          </SettingsRow>
          <SettingsRow label="Foreground">
            <ColorField
              label="Foreground"
              value={slot.foreground}
              fallback={defaults.foreground}
              onChange={(foreground) => patchSlot({ foreground })}
            />
          </SettingsRow>
          <SettingsRow label="Contrast">
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
            checked={appearance.separateModes}
            onChange={(separateModes) =>
              updateAppearance((current) => ({ ...current, separateModes }))
            }
          />
          {appearance.separateModes && (
            <SettingsRow label="Editing">
              <SegmentedControl
                value={targetMode}
                options={MODE_OPTIONS}
                onChange={setEditingMode}
              />
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsGroup>

      <SettingsGroup title="Typography">
        <SettingsRow label="Text font" description="Messages and the app itself, in one family.">
          <FontPicker
            role="ui"
            label="Text font"
            value={slot.fonts.ui}
            onChange={(ui) => patchFonts({ ui })}
          />
        </SettingsRow>
        <SettingsRow label="Code font">
          <FontPicker
            role="code"
            label="Code font"
            value={slot.fonts.code}
            onChange={(code) => patchFonts({ code })}
          />
        </SettingsRow>
        <SettingsRow label="Text size">
          <NumberInput
            label="Text size"
            suffix="px"
            value={slot.fonts.uiSize}
            min={UI_FONT_SIZE_MIN}
            max={UI_FONT_SIZE_MAX}
            onChange={(uiSize) => patchFonts({ uiSize })}
          />
        </SettingsRow>
        <SettingsRow label="Code font size">
          <NumberInput
            label="Code font size"
            suffix="px"
            value={slot.fonts.codeSize}
            min={CODE_FONT_SIZE_MIN}
            max={CODE_FONT_SIZE_MAX}
            onChange={(codeSize) => patchFonts({ codeSize })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Code & diagrams" separateCards>
        <SettingsCard>
          <CodeThemeSettings />
        </SettingsCard>
        <SettingsCard>
          <DiagramThemeSettings />
        </SettingsCard>
      </SettingsGroup>

      <SettingsGroup title="Details">
        <SettingSwitch
          label="Translucent sidebar"
          checked={slot.translucentSidebar}
          onChange={(translucentSidebar) => patchSlot({ translucentSidebar })}
        />
        <SettingSwitch
          label="Font smoothing"
          checked={appearance.fontSmoothing}
          onChange={(fontSmoothing) =>
            updateAppearance((current) => ({ ...current, fontSmoothing }))
          }
        />
        <SettingsRow label="Reduce motion">
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
          className="text-caption text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Reset appearance
        </button>
      </div>
    </>
  );
}
