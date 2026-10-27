/**
 * Writes the derived appearance to the document.
 *
 * The only DOM writer for theme colors: it publishes `--app-*` custom
 * properties on `<html>`, toggles the `dark`/`light` class, and sets the motion
 * and font-smoothing data attributes. Surfaces that cannot read CSS variables
 * (xterm, Shiki, the mini-map canvas) subscribe instead.
 */
import { DEFAULT_APPEARANCE, type AppearanceSettings } from '../../../shared/appearance';
import {
  resolveAppearance,
  type AppearanceEnvironment,
  type ResolvedAppearance,
} from '../../../shared/appearanceTokens';
import { appearanceTokensFor } from './appearanceTokensCache';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';
const SYSTEM_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type AppearanceListener = (resolved: ResolvedAppearance) => void;

const listeners = new Set<AppearanceListener>();

/**
 * What the DOM currently shows. Before the first write it stands in for the
 * defaults, so `readResolvedAppearance` — a `useSyncExternalStore` snapshot that
 * React may call during render — never has to apply anything itself.
 */
const FALLBACK_ENVIRONMENT: AppearanceEnvironment = {
  systemIsDark: false,
  systemPrefersReducedMotion: false,
};

let lastResolved: ResolvedAppearance | null = null;
let lastTokens: Record<string, string> | null = null;

let transitionBlocker: HTMLStyleElement | null = null;
let transitionRestoreFrame: number | null = null;

/**
 * Turns CSS transitions off until the new colours have painted. Without it every
 * element with a colour transition fades on its own clock and a theme switch
 * ripples across the window. One shared element: a slider dragged per frame
 * keeps it in place instead of adding and removing a rule every frame.
 */
function suspendTransitions(): void {
  if (transitionBlocker === null) {
    transitionBlocker = document.createElement('style');
    transitionBlocker.textContent = '*,*::before,*::after{transition:none!important}';
    document.head.appendChild(transitionBlocker);
  }
  if (transitionRestoreFrame !== null) {
    window.cancelAnimationFrame(transitionRestoreFrame);
  }
  // Two frames: the first paints the new colours with transitions off.
  transitionRestoreFrame = window.requestAnimationFrame(() => {
    transitionRestoreFrame = window.requestAnimationFrame(() => {
      transitionRestoreFrame = null;
      transitionBlocker?.remove();
      transitionBlocker = null;
    });
  });
}

function tokensChanged(previous: Record<string, string>, next: Record<string, string>): boolean {
  const names = Object.keys(next);
  return (
    names.length !== Object.keys(previous).length ||
    names.some((name) => previous[name] !== next[name])
  );
}

/** Fields of a resolved appearance that the token set does not carry. */
function sameResolved(previous: ResolvedAppearance, next: ResolvedAppearance): boolean {
  return (
    previous.mode === next.mode &&
    previous.reduceMotion === next.reduceMotion &&
    previous.fontSmoothing === next.fontSmoothing
  );
}

/** Notifies non-CSS consumers after every applied appearance. */
export function subscribeAppearance(listener: AppearanceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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
  const tokens = appearanceTokensFor(resolved);
  const root = document.documentElement;

  // Nothing the page can see has changed (the same appearance was committed
  // twice, or a commit carried the same value): keep the previous snapshot so
  // subscribers do not re-theme for an identical object.
  if (
    lastResolved !== null &&
    lastTokens !== null &&
    !tokensChanged(lastTokens, tokens) &&
    sameResolved(lastResolved, resolved)
  ) {
    return lastResolved;
  }

  // The first apply has nothing on screen to transition from, and a commit
  // that only changed chat settings leaves the colours as they were.
  if (lastTokens !== null && tokensChanged(lastTokens, tokens)) {
    suspendTransitions();
  }
  lastTokens = tokens;

  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle('dark', resolved.mode === 'dark');
  root.classList.toggle('light', resolved.mode === 'light');
  root.dataset.reduceMotion = resolved.reduceMotion ? 'true' : 'false';
  root.dataset.fontSmoothing = resolved.fontSmoothing ? 'on' : 'off';
  lastResolved = resolved;

  for (const listener of listeners) {
    listener(resolved);
  }
  return resolved;
}

/**
 * The last applied appearance, for components that need tokens in JS.
 *
 * Reading before the first write yields the defaults. That value is memoised
 * rather than recomputed, so two reads in one render always agree — a snapshot
 * that changed under React would be a tearing bug.
 */
export function readResolvedAppearance(): ResolvedAppearance {
  lastResolved ??= resolveAppearance(DEFAULT_APPEARANCE, FALLBACK_ENVIRONMENT);
  return lastResolved;
}
