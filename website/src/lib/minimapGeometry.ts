// Ported from UserMessageMiniMap.tsx; keep the numbers and curve in sync.
import { MESSAGE_LIST_HORIZONTAL_PADDING, MESSAGE_LIST_MAX_WIDTH } from './appLayout';

export const LINE_WIDTH_MAX_CAP = 48;
export const LINE_WIDTH_RIGHT_MARGIN = 8;
export const LINE_WIDTH_MIN_CAP = 8;

export function measureMaxLineWidth(containerWidth: number): number {
  const centreGap = Math.max(0, (containerWidth - MESSAGE_LIST_MAX_WIDTH) / 2);
  const availableSpace = centreGap + MESSAGE_LIST_HORIZONTAL_PADDING;
  return Math.max(
    LINE_WIDTH_MIN_CAP,
    Math.min(LINE_WIDTH_MAX_CAP, availableSpace - LINE_WIDTH_RIGHT_MARGIN),
  );
}

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
