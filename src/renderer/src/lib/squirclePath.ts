/**
 * Superellipse corners for hand-drawn SVG.
 *
 * `corner-shape` cannot reach inside an SVG, so an outlined path is the only way
 * to keep a drawn box on the same corner family as the surfaces around it.
 */

/** Exponent behind the app's `corner-shape: superellipse(1.5)`: n = 2^k. */
const CORNER_EXPONENT = 2 ** 1.5;

/** Samples per corner. Six is already smooth at 16px; the corner is 1.5px there. */
const CORNER_SEGMENTS = 6;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One superellipse corner as the points between two edge tangents.
 *
 * `corner-shape` cannot reach inside an SVG, so an outlined path is the only way
 * to keep a drawn box on the same corner family as the surfaces around it. The
 * polyline is exact rather than a bezier approximation: at this size the
 * segments are a fraction of a device pixel apart.
 */
function cornerPoints(
  centerX: number,
  centerY: number,
  radius: number,
  horizontalSign: 1 | -1,
  verticalSign: 1 | -1,
  reversed: boolean,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index <= CORNER_SEGMENTS; index += 1) {
    const step = reversed ? CORNER_SEGMENTS - index : index;
    const angle = (Math.PI / 2) * (step / CORNER_SEGMENTS);
    // |cos|^(2/n) and |sin|^(2/n) are the superellipse's own parametrisation.
    const offsetX = radius * Math.abs(Math.cos(angle)) ** (2 / CORNER_EXPONENT);
    const offsetY = radius * Math.abs(Math.sin(angle)) ** (2 / CORNER_EXPONENT);
    points.push({
      x: round(centerX + horizontalSign * offsetX),
      y: round(centerY + verticalSign * offsetY),
    });
  }
  return points;
}

/** Path for a rectangle whose corners are superellipses of `radius`. */
export function superellipseRectPath({
  x,
  y,
  width,
  height,
  radius,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}): string {
  const right = x + width;
  const bottom = y + height;
  // Top right, bottom right, bottom left, top left: the order a clockwise walk
  // meets them, each entered on the edge it comes down and left on the next.
  const corners = [
    cornerPoints(right - radius, y + radius, radius, 1, -1, true),
    cornerPoints(right - radius, bottom - radius, radius, 1, 1, false),
    cornerPoints(x + radius, bottom - radius, radius, -1, 1, true),
    cornerPoints(x + radius, y + radius, radius, -1, -1, false),
  ];

  // Each corner ends where the next one starts along the same edge, so the
  // straight runs need no points of their own. The walk starts at the point the
  // last corner exits onto, which is also where it closes.
  const lastCorner = corners[3];
  const start = lastCorner[lastCorner.length - 1];
  const rest = corners.flat();
  const moves = rest.map((point) => `L ${point.x} ${point.y}`);
  return `M ${start.x} ${start.y} ${moves.join(' ')} Z`;
}
