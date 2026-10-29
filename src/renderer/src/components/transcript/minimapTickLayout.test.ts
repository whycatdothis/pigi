import { describe, expect, it } from 'vitest';
import { computeTickLayout, TICK_EDGE_INSET_DEVICE_PX } from './minimapTickLayout';

const RATIOS = [1, 1.1, 1.25, 1.5, 1.75, 2, 2.19, 2.25, 2.5, 3];

describe('computeTickLayout', () => {
  it('puts every length on whole device pixels', () => {
    for (const devicePixelRatio of RATIOS) {
      for (const tickCount of [1, 2, 6, 7, 41]) {
        const layout = computeTickLayout(devicePixelRatio, tickCount, 48);
        for (const value of [
          layout.lineHeight,
          layout.pitch,
          layout.viewWidth,
          layout.viewHeight,
        ]) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
      }
    }
  });

  it('leaves one inset of room on every side of the column', () => {
    for (const devicePixelRatio of RATIOS) {
      const tickCount = 41;
      const layout = computeTickLayout(devicePixelRatio, tickCount, 48);
      expect(layout.viewWidth).toBe(
        Math.round(48 * devicePixelRatio) + TICK_EDGE_INSET_DEVICE_PX * 2,
      );
      const lastBottom = (tickCount - 1) * layout.pitch + layout.lineHeight;
      expect(lastBottom + TICK_EDGE_INSET_DEVICE_PX).toBe(
        layout.viewHeight - TICK_EDGE_INSET_DEVICE_PX,
      );
    }
  });

  it('keeps the pitch above the line height so lines stay separate', () => {
    for (const devicePixelRatio of RATIOS) {
      const layout = computeTickLayout(devicePixelRatio, 10, 48);
      expect(layout.pitch).toBeGreaterThan(layout.lineHeight);
    }
  });
});
