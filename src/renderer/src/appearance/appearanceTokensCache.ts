/**
 * The token set for an appearance, shared between every component that needs it
 * in JavaScript.
 *
 * `applyAppearance` writes the tokens to the document, but Shiki has to read two
 * of them back out and the settings previews derive a whole set per mode. Each
 * derivation runs the colour math (binary search over contrast ratios), so it is
 * done once per resolved appearance rather than once per code block on screen.
 */
import { deriveTokens, type ResolvedAppearance } from '../../../shared/appearanceTokens';

let cachedFor: ResolvedAppearance | null = null;
let cachedTokens: Record<string, string> | null = null;

export function appearanceTokensFor(resolved: ResolvedAppearance): Record<string, string> {
  if (!cachedFor || cachedFor !== resolved || cachedTokens === null) {
    cachedFor = resolved;
    cachedTokens = deriveTokens(resolved);
  }
  return cachedTokens;
}
