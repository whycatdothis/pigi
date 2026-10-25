/**
 * pigi's own preferences (not pi settings).
 *
 * Persisted to `settings.json` in the app's user data directory. The main
 * process reads it before creating the window (native theme, window
 * background) and the preload reads it for the renderer, so the value is
 * available synchronously before the first paint (no theme flash) — see
 * `main/pigiSettingsFile.ts` and `state/settingsStore.ts`.
 *
 * Storage is versioned: v1 was a flat `{ theme, accentId, toolBlockViewMode }`
 * record, v2 nests appearance under its own object and adds per-mode slots.
 * `parsePigiSettings` migrates v1 in place, field by field.
 */
import {
  DEFAULT_APPEARANCE,
  DEFAULT_THEME_ACCENT_ID,
  THEME_MODES,
  isAccentPresetId,
  parseAppearance,
  type AppearanceSettings,
  type ThemeMode,
} from './appearance';

export type ToolBlockViewMode = 'default' | 'compact_read' | 'minimal';

export interface ChatSettings {
  toolBlockViewMode: ToolBlockViewMode;
}

export interface PigiSettings {
  version: 2;
  appearance: AppearanceSettings;
  chat: ChatSettings;
}

/**
 * Where the pre-file versions kept the value. Reads once, to migrate, and never
 * written again.
 */
export const PIGI_SETTINGS_STORAGE_KEY = 'pigi.settings';

/**
 * Passed to the renderer through `webPreferences.additionalArguments` so the
 * preload can read the file itself. A path, not the contents: argv is a
 * snapshot of window creation, so the value would go stale on every reload.
 */
export const PIGI_SETTINGS_PATH_ARGUMENT = '--pigi-settings-path=';

/** Re-exported for the appearance UI, which labels the mode control. */
export const PIGI_THEMES: readonly ThemeMode[] = THEME_MODES;

export const TOOL_BLOCK_VIEW_MODES: readonly ToolBlockViewMode[] = [
  'default',
  'compact_read',
  'minimal',
];

export const DEFAULT_PIGI_SETTINGS: PigiSettings = {
  version: 2,
  appearance: DEFAULT_APPEARANCE,
  chat: { toolBlockViewMode: 'compact_read' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  // Cast required: TS Array.includes() signature doesn't accept unknown
  return typeof value === 'string' && values.includes(value as T);
}

export function isToolBlockViewMode(value: unknown): value is ToolBlockViewMode {
  return includes(TOOL_BLOCK_VIEW_MODES, value);
}

function parseChat(raw: unknown): ChatSettings {
  const record = isRecord(raw) ? raw : {};
  return {
    toolBlockViewMode: isToolBlockViewMode(record.toolBlockViewMode)
      ? record.toolBlockViewMode
      : DEFAULT_PIGI_SETTINGS.chat.toolBlockViewMode,
  };
}

/** v1 had one theme and one accent for the whole app. */
function migrateFromV1(raw: unknown): PigiSettings {
  const record = isRecord(raw) ? raw : {};
  const appearance = parseAppearance(record.appearance);
  const mode = includes(PIGI_THEMES, record.theme) ? record.theme : appearance.mode;
  const accentId = isAccentPresetId(record.accentId) ? record.accentId : DEFAULT_THEME_ACCENT_ID;

  return {
    version: 2,
    appearance: {
      ...appearance,
      mode,
      separateModes: false,
      light: { ...appearance.light, accent: { presetId: accentId } },
      dark: { ...appearance.dark, accent: { presetId: accentId } },
    },
    chat: parseChat(record),
  };
}

/**
 * Parse a persisted blob, falling back field by field. Never throws: a corrupt
 * store must not prevent the app from starting.
 */
export function parsePigiSettings(raw: unknown): PigiSettings {
  if (isRecord(raw) && raw.version === 2) {
    return {
      version: 2,
      appearance: parseAppearance(raw.appearance),
      chat: parseChat(raw.chat),
    };
  }
  return migrateFromV1(raw);
}
