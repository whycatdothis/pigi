/**
 * Renderer-side view of the accent presets.
 *
 * The data lives in `src/shared/appearance.ts` so the model, the token
 * derivation, and the picker agree on one list. This module keeps the names the
 * settings UI already uses.
 */
export {
  ACCENT_PRESETS as THEME_ACCENTS,
  DEFAULT_THEME_ACCENT_ID,
  findAccentPreset as findThemeAccent,
} from '../../../shared/appearance';
export type { ThemeAccent } from '../../../shared/appearance';
