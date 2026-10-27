/**
 * Subscribes a component to the applied appearance.
 *
 * Uses the value the DOM writer resolved, so a component that needs tokens in
 * JavaScript (Shiki, the terminal) sees exactly what CSS sees, including the
 * system preference and the per-mode slot that was chosen.
 */
import { useSyncExternalStore } from 'react';
import { readResolvedAppearance, subscribeAppearance } from './applyAppearance';
import type { ResolvedAppearance } from '../../../shared/appearanceTokens';

export function useResolvedAppearance(): ResolvedAppearance {
  return useSyncExternalStore(subscribeAppearance, readResolvedAppearance);
}
