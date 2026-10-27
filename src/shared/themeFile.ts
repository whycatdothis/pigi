/**
 * Theme files: the whole appearance object in a portable envelope, so a look
 * can be shared as text. Parsing is strict about the envelope (kind and
 * version) and tolerant about the payload (the appearance parser fills in
 * anything missing), which keeps older themes importable.
 */
import { parseAppearance, type AppearanceSettings } from './appearance';

export const THEME_FILE_KIND = 'pigi-theme';
export const THEME_FILE_VERSION = 1;

export interface ThemeFile {
  kind: typeof THEME_FILE_KIND;
  version: number;
  appearance: AppearanceSettings;
}

export type ThemeParseResult =
  | { ok: true; appearance: AppearanceSettings }
  | { ok: false; error: string };

export function serializeTheme(appearance: AppearanceSettings): string {
  const file: ThemeFile = {
    kind: THEME_FILE_KIND,
    version: THEME_FILE_VERSION,
    appearance,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseThemeFile(text: string): ThemeParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Paste a theme first.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'That is not valid JSON.' };
  }

  if (!isRecord(raw)) {
    return { ok: false, error: 'That is not a pigi theme.' };
  }
  if (raw.kind !== THEME_FILE_KIND) {
    return { ok: false, error: 'That is not a pigi theme.' };
  }
  if (typeof raw.version !== 'number' || !Number.isFinite(raw.version)) {
    return { ok: false, error: 'The theme has no version.' };
  }
  if (raw.version > THEME_FILE_VERSION) {
    return { ok: false, error: 'This theme was made by a newer version of pigi.' };
  }
  if (!isRecord(raw.appearance)) {
    return { ok: false, error: 'The theme has no appearance settings.' };
  }

  return { ok: true, appearance: parseAppearance(raw.appearance) };
}
