/**
 * pigi's own preferences (not pi settings).
 *
 * These are renderer-local and persisted to localStorage so they are available
 * synchronously before the first paint (theme flash) — see settingsStore.ts.
 */

export type PigiTheme = 'system' | 'light' | 'dark';

export type ToolBlockViewMode = 'default' | 'compact_read' | 'minimal';

export interface PigiSettings {
  theme: PigiTheme;
  accentId: string;
  toolBlockViewMode: ToolBlockViewMode;
}

export const PIGI_SETTINGS_STORAGE_KEY = 'pigi.settings';

export const PIGI_THEMES: readonly PigiTheme[] = ['system', 'light', 'dark'];

export const TOOL_BLOCK_VIEW_MODES: readonly ToolBlockViewMode[] = [
  'default',
  'compact_read',
  'minimal',
];

/** Accent applied when the user has not chosen one (see themeAccents.ts). */
export const DEFAULT_THEME_ACCENT_ID = 'indigo';

export const DEFAULT_PIGI_SETTINGS: PigiSettings = {
  theme: 'system',
  accentId: DEFAULT_THEME_ACCENT_ID,
  toolBlockViewMode: 'compact_read',
};

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  // Cast required: TS Array.includes() signature doesn't accept unknown
  return typeof value === 'string' && values.includes(value as T);
}

export function isToolBlockViewMode(value: unknown): value is ToolBlockViewMode {
  return includes(TOOL_BLOCK_VIEW_MODES, value);
}

/**
 * Parse a persisted blob, falling back to defaults field by field. Never
 * throws: a corrupt store must not prevent the app from starting.
 */
export function parsePigiSettings(raw: unknown): PigiSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_PIGI_SETTINGS };
  }
  const record = raw as Record<string, unknown>;
  return {
    theme: includes(PIGI_THEMES, record.theme) ? record.theme : DEFAULT_PIGI_SETTINGS.theme,
    accentId:
      typeof record.accentId === 'string' && record.accentId.length > 0
        ? record.accentId
        : DEFAULT_PIGI_SETTINGS.accentId,
    toolBlockViewMode: includes(TOOL_BLOCK_VIEW_MODES, record.toolBlockViewMode)
      ? record.toolBlockViewMode
      : DEFAULT_PIGI_SETTINGS.toolBlockViewMode,
  };
}
