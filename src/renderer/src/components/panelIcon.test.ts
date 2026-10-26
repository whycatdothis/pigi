import { describe, expect, it } from 'vitest';
import { superellipseRectPath } from '../lib/squirclePath';

const SHAPE = { x: 2.25, y: 3.75, width: 19.5, height: 16.5, radius: 2.25 };

function points(path: string): { x: number; y: number }[] {
  return path
    .split(/[ML] /)
    .slice(1)
    .map((pair) => {
      const [x, y] = pair.replace(' Z', '').split(' ');
      return { x: Number(x), y: Number(y) };
    });
}

describe('superellipseRectPath', () => {
  const path = superellipseRectPath(SHAPE);
  const all = points(path);

  it('closes back onto its first point', () => {
    expect(path.endsWith(' Z')).toBe(true);
    expect(all[0]).toEqual(all.at(-1));
  });

  it('stays inside the rectangle it was given', () => {
    // The last point closes the loop onto the first one, so it would count as a
    // second turn.
    for (const point of all.slice(0, -1)) {
      expect(point.x).toBeGreaterThanOrEqual(SHAPE.x);
      expect(point.x).toBeLessThanOrEqual(SHAPE.x + SHAPE.width);
      expect(point.y).toBeGreaterThanOrEqual(SHAPE.y);
      expect(point.y).toBeLessThanOrEqual(SHAPE.y + SHAPE.height);
    }
  });

  it('touches every edge exactly at a corner tangent', () => {
    const { x, y, width, height, radius } = SHAPE;
    const touches = (target: { x: number; y: number }): boolean =>
      all.some(
        (point) => Math.abs(point.x - target.x) < 0.01 && Math.abs(point.y - target.y) < 0.01,
      );

    expect(touches({ x: x + radius, y })).toBe(true);
    expect(touches({ x: x + width - radius, y })).toBe(true);
    expect(touches({ x, y: y + radius })).toBe(true);
    expect(touches({ x: x + width, y: y + height - radius })).toBe(true);
  });

  it('wraps the perimeter exactly once, clockwise', () => {
    const centerX = SHAPE.x + SHAPE.width / 2;
    const centerY = SHAPE.y + SHAPE.height / 2;
    const closed = all.slice(0, -1);
    // The explicit closing point makes the last step a real one, not a gap.
    const angles = all.map((point) => Math.atan2(point.y - centerY, point.x - centerX));

    // Unwrap across the ±180 branch and add up the sweep: one clockwise turn.
    let sweep = 0;
    let previous = angles[0];
    for (const angle of angles.slice(1)) {
      let step = angle - previous;
      if (step < 0) {
        step += Math.PI * 2;
      }
      sweep += step;
      previous = angle;
    }
    expect(sweep / (Math.PI * 2)).toBeCloseTo(1, 2);

    // Signed area of a clockwise polygon (y points down) is positive; a shape
    // walked out of order self-intersects and comes out smaller or negative.
    const area = closed.reduce((total, point, index) => {
      const next = closed[(index + 1) % closed.length];
      return total + (point.x * next.y - next.x * point.y);
    }, 0);
    expect(area).toBeGreaterThan(0);
    // Rounded corners remove a little from the bare rectangle, nothing more.
    const rectArea = SHAPE.width * SHAPE.height;
    expect(area / 2).toBeLessThan(rectArea);
    expect(area / 2).toBeGreaterThan(rectArea * 0.97);
  });

  it('bulges past a circle of the same radius', () => {
    const { x, y, radius } = SHAPE;
    // A circular corner puts this 45-degree point at exactly the radius from the
    // corner centre; a squircle sits further out on the diagonal.
    const centre = { x: x + radius, y: y + radius };
    const diagonal = all
      .map((point) => Math.hypot(point.x - centre.x, point.y - centre.y))
      .filter((distance) => distance > 0)
      .reduce((max, distance) => Math.max(max, distance), 0);
    expect(diagonal).toBeGreaterThan(radius);
  });
});
