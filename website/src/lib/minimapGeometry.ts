/**
 * The minimap's bars, ported from the app.
 *
 * `UserMessageMiniMap.tsx` sizes each bar from the room between the transcript's
 * centred column and the window edge, so a narrow window gets a narrow strip
 * instead of a strip lying over the text. The numbers and the curve are its own;
 * the only change is that this page draws them from a scroll container it can
 * measure, exactly as the app does when its window is resized.
 *
 * The shapes: few messages swell linearly towards the middle, more of them
 * quadratically, and past ten the middle reaches the full width. That is what
 * makes a session readable at a glance from the corner of the window.
 */
import { MESSAGE_LIST_HORIZONTAL_PADDING, MESSAGE_LIST_MAX_WIDTH } from './appLayout';

export const LINE_WIDTH_MAX_CAP = 48;
export const LINE_WIDTH_RIGHT_MARGIN = 8;
export const LINE_WIDTH_MIN_CAP = 8;

/**
 * How wide the widest bar may be, given the scroll container it sits in.
 *
 * The app starts from its own initial value (`MESSAGE_LIST_HORIZONTAL_PADDING -
 * LINE_WIDTH_RIGHT_MARGIN`), which is also what the markup is built with: a still
 * drawn before this script runs has a sane strip rather than a full-width one.
 */
export function measureMaxLineWidth(containerWidth: number): number {
  const centreGap = Math.max(0, (containerWidth - MESSAGE_LIST_MAX_WIDTH) / 2);
  const availableSpace = centreGap + MESSAGE_LIST_HORIZONTAL_PADDING;
  return Math.max(
    LINE_WIDTH_MIN_CAP,
    Math.min(LINE_WIDTH_MAX_CAP, availableSpace - LINE_WIDTH_RIGHT_MARGIN),
  );
}

/** Bar width by position, ported from the app. */
export function getLineWidth(index: number, total: number, maxWidth: number): number {
  if (total <= 1) return maxWidth * 0.4;
  if (total === 2) return Math.round(maxWidth * 0.5);

  const normalized = index / (total - 1);
  const distanceFromCentre = 1 - Math.abs(normalized * 2 - 1);

  if (total <= 5) {
    const target = maxWidth * 0.6;
    return Math.round(LINE_WIDTH_MIN_CAP + distanceFromCentre * (target - LINE_WIDTH_MIN_CAP));
  }
  if (total <= 10) {
    const factor = distanceFromCentre * distanceFromCentre;
    return Math.round(LINE_WIDTH_MIN_CAP + factor * (maxWidth * 0.8 - LINE_WIDTH_MIN_CAP));
  }

  const factor = distanceFromCentre * distanceFromCentre;
  return Math.round(LINE_WIDTH_MIN_CAP + factor * (maxWidth - LINE_WIDTH_MIN_CAP));
}
