/**
 * Writes the derived appearance to the document.
 *
 * The only DOM writer for theme colors: it publishes `--app-*` custom
 * properties on `<html>`, toggles the `dark`/`light` class, and sets the motion
 * and font-smoothing data attributes. Surfaces that cannot read CSS variables
 * (xterm, Shiki, the mini-map canvas) subscribe instead.
 */
import type { AppearanceSettings } from '../../../shared/appearance';
import {
  deriveTokens,
  resolveAppearance,
  type AppearanceEnvironment,
  type ResolvedAppearance,
} from '../../../shared/appearanceTokens';

type AppearanceListener = (resolved: ResolvedAppearance) => void;

const listeners = new Set<AppearanceListener>();

/** Notifies non-CSS consumers after every applied appearance. */
export function subscribeAppearance(listener: AppearanceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';
const SYSTEM_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function readSystemEnvironment(): AppearanceEnvironment {
  return {
    systemIsDark: window.matchMedia(SYSTEM_DARK_QUERY).matches,
    systemPrefersReducedMotion: window.matchMedia(SYSTEM_REDUCED_MOTION_QUERY).matches,
  };
}

/** Applies settings and returns what was resolved (mode, slot, flags). */
export function applyAppearance(
  settings: AppearanceSettings,
  environment: AppearanceEnvironment = readSystemEnvironment(),
): ResolvedAppearance {
  const resolved = resolveAppearance(settings, environment);
  const tokens = deriveTokens(resolved);
  const root = document.documentElement;

  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle('dark', resolved.mode === 'dark');
  root.classList.toggle('light', resolved.mode === 'light');
  root.dataset.reduceMotion = resolved.reduceMotion ? 'true' : 'false';
  root.dataset.fontSmoothing = resolved.fontSmoothing ? 'on' : 'off';

  for (const listener of listeners) {
    listener(resolved);
  }
  return resolved;
}

/** Current resolved mode, for UI that edits the active slot. */
export function currentColorMode(settings: AppearanceSettings): 'light' | 'dark' {
  return resolveAppearance(settings, readSystemEnvironment()).mode;
}
