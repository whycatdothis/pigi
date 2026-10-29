/**
 * Geometry of the message minimap's tick column, in device pixels.
 *
 * A line laid out as a CSS box is 1.5 CSS px tall, which is 3.29 device px on a
 * 2x display at 110% zoom, and Chromium quantizes box edges to 1/64 px: the
 * lines land on different phases and the column reads alternately thick and
 * thin (26-37% spread in painted ink between lines). One SVG whose user unit is
 * a device pixel keeps every line on the same grid, within 3% at 11 ratios.
 *
 * That spread is about the column being even, not about sharpness: the column as
 * a whole still starts wherever layout put it, so each line covers two or three
 * device rows instead of landing on one.
 */

export interface TickLayout {
  devicePixelRatio: number;
  /** Every length below is in device pixels, so the drawing has one unit. */
  lineHeight: number;
  pitch: number;
  viewWidth: number;
  viewHeight: number;
}

/** Line height and pitch, in CSS px; the drawing rounds them to device pixels. */
const TICK_HEIGHT_PX = 1.5;
const TICK_PITCH_PX = 8;
/**
 * Room around the lines: the `svg` clips to its viewport, and a line flush
 * against it lost the antialiased half of its edge row.
 */
export const TICK_EDGE_INSET_DEVICE_PX = 1;

export function computeTickLayout(
  devicePixelRatio: number,
  tickCount: number,
  maxLineWidth: number,
): TickLayout {
  const lineHeight = Math.max(1, Math.round(TICK_HEIGHT_PX * devicePixelRatio));
  const pitch = Math.max(lineHeight + 1, Math.round(TICK_PITCH_PX * devicePixelRatio));
  return {
    devicePixelRatio,
    lineHeight,
    pitch,
    // The viewport clips, so the outermost lines get a margin on both axes.
    viewWidth: Math.max(
      1,
      Math.round(maxLineWidth * devicePixelRatio) + TICK_EDGE_INSET_DEVICE_PX * 2,
    ),
    viewHeight: Math.max(
      lineHeight,
      (tickCount - 1) * pitch + lineHeight + TICK_EDGE_INSET_DEVICE_PX * 2,
    ),
  };
}
