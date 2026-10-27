/**
 * Color math for the appearance engine.
 *
 * Everything the appearance pipeline needs and nothing else: parse the color
 * formats a user can type, move between sRGB and oklch, mix in oklab, and
 * measure WCAG contrast. Pure and dependency-free so it can be unit-tested and
 * reused by the renderer and the main process.
 */

export interface OklchColor {
  /** 0..1 */
  lightness: number;
  /** 0..~0.4 for sRGB colors */
  chroma: number;
  /** degrees, 0..360 */
  hue: number;
}

export interface OklabColor {
  lightness: number;
  a: number;
  b: number;
}

export interface RgbColor {
  /** 0..255 */
  red: number;
  green: number;
  blue: number;
}

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_PATTERN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;
const OKLCH_PATTERN =
  /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*[\d.]+%?\s*)?\)$/i;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function hexToRgb(hex: string): RgbColor | null {
  if (!HEX_PATTERN.test(hex)) {
    return null;
  }
  const digits = hex.slice(1);
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  return {
    red: parseInt(expanded.slice(0, 2), 16),
    green: parseInt(expanded.slice(2, 4), 16),
    blue: parseInt(expanded.slice(4, 6), 16),
  };
}

export function rgbToHex(color: RgbColor): string {
  const channel = (value: number): string =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
}

export function rgbToOklch(color: RgbColor): OklchColor {
  const red = srgbToLinear(clamp(color.red, 0, 255) / 255);
  const green = srgbToLinear(clamp(color.green, 0, 255) / 255);
  const blue = srgbToLinear(clamp(color.blue, 0, 255) / 255);

  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

  const chroma = Math.hypot(a, b);
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { lightness, chroma, hue };
}

export function oklchToOklab(color: OklchColor): OklabColor {
  const radians = (color.hue * Math.PI) / 180;
  return {
    lightness: color.lightness,
    a: color.chroma * Math.cos(radians),
    b: color.chroma * Math.sin(radians),
  };
}

export function oklabToOklch(color: OklabColor): OklchColor {
  const chroma = Math.hypot(color.a, color.b);
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(color.b, color.a) * 180) / Math.PI + 360) % 360;
  return { lightness: color.lightness, chroma, hue };
}

/** Linear-light RGB, clamped to the sRGB gamut. */
export function oklchToLinearRgb(color: OklchColor): [number, number, number] {
  const { lightness, a, b } = oklchToOklab(color);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    clamp(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short, 0, 1),
    clamp(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short, 0, 1),
    clamp(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short, 0, 1),
  ];
}

export function oklchToRgb(color: OklchColor): RgbColor {
  const [red, green, blue] = oklchToLinearRgb(color);
  return {
    red: Math.round(linearToSrgb(red) * 255),
    green: Math.round(linearToSrgb(green) * 255),
    blue: Math.round(linearToSrgb(blue) * 255),
  };
}

/** Accepts `#rgb`, `#rrggbb`, `rgb()`/`rgba()`, and `oklch()`. */
export function parseCssColor(value: string): OklchColor | null {
  const input = value.trim();

  const hex = hexToRgb(input);
  if (hex) {
    return rgbToOklch(hex);
  }

  const rgbMatch = RGB_PATTERN.exec(input);
  if (rgbMatch) {
    return rgbToOklch({
      red: Number(rgbMatch[1]),
      green: Number(rgbMatch[2]),
      blue: Number(rgbMatch[3]),
    });
  }

  const oklchMatch = OKLCH_PATTERN.exec(input);
  if (oklchMatch) {
    const lightness = Number(oklchMatch[1]) / (oklchMatch[2] === '%' ? 100 : 1);
    return {
      lightness: clamp(lightness, 0, 1),
      chroma: Math.max(0, Number(oklchMatch[3])),
      hue: ((Number(oklchMatch[4]) % 360) + 360) % 360,
    };
  }

  return null;
}

/** Normalizes a user-entered color to `#rrggbb`, or null when unparseable. */
export function normalizeHexColor(value: string): string | null {
  const parsed = parseCssColor(value);
  return parsed ? rgbToHex(oklchToRgb(parsed)) : null;
}

export function formatOklch(color: OklchColor): string {
  const lightness = (clamp(color.lightness, 0, 1) * 100).toFixed(2);
  const chroma = clamp(color.chroma, 0, 0.5).toFixed(4);
  const hue = (((color.hue % 360) + 360) % 360).toFixed(2);
  return `oklch(${lightness}% ${chroma} ${hue})`;
}

export function formatHex(color: OklchColor): string {
  return rgbToHex(oklchToRgb(color));
}

/** Mixes in oklab so hue interpolation does not take the long way around. */
export function mixOklch(from: OklchColor, toward: OklchColor, amount: number): OklchColor {
  const t = clamp(amount, 0, 1);
  const start = oklchToOklab(from);
  const end = oklchToOklab(toward);
  return oklabToOklch({
    lightness: start.lightness + (end.lightness - start.lightness) * t,
    a: start.a + (end.a - start.a) * t,
    b: start.b + (end.b - start.b) * t,
  });
}

export function withLightness(color: OklchColor, lightness: number): OklchColor {
  return { ...color, lightness: clamp(lightness, 0, 1) };
}

/** WCAG relative luminance, from the linear-light channels. */
export function relativeLuminance(color: OklchColor): number {
  const [red, green, blue] = oklchToLinearRgb(color);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio, 1..21. Symmetric. */
export function contrastRatio(first: OklchColor, second: OklchColor): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Mixes `from` toward `toward` by the smallest amount that reaches `target`
 * contrast against `reference`. Returns 0 when `from` already passes and 1
 * when even the far end cannot (the caller can then clamp lightness).
 */
export function solveMixAmount(
  from: OklchColor,
  toward: OklchColor,
  reference: OklchColor,
  target: number,
): number {
  if (contrastRatio(from, reference) >= target) {
    return 0;
  }
  if (contrastRatio(toward, reference) < target) {
    return 1;
  }

  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio(mixOklch(from, toward, middle), reference) >= target) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high;
}

/**
 * Largest mix amount that still clears `target` contrast against `reference`.
 * Used for text that starts at full contrast (the foreground) and is muted
 * toward the background: the result is the most muted color that keeps the
 * floor.
 */
export function solveMaxMixAmount(
  from: OklchColor,
  toward: OklchColor,
  reference: OklchColor,
  target: number,
): number {
  if (contrastRatio(from, reference) < target) {
    return 0;
  }
  if (contrastRatio(toward, reference) >= target) {
    return 1;
  }

  let passing = 0;
  let failing = 1;
  for (let step = 0; step < 16; step += 1) {
    const middle = (passing + failing) / 2;
    if (contrastRatio(mixOklch(from, toward, middle), reference) >= target) {
      passing = middle;
    } else {
      failing = middle;
    }
  }
  return passing;
}

/**
 * Moves `color` away from `reference` along lightness until it reaches
 * `target` contrast. Used to enforce a foreground floor for user-entered
 * colors without touching their hue.
 */
export function ensureContrast(
  color: OklchColor,
  reference: OklchColor,
  target: number,
): OklchColor {
  if (contrastRatio(color, reference) >= target) {
    return color;
  }

  const direction = reference.lightness >= color.lightness ? -1 : 1;
  for (let step = 1; step <= 100; step += 1) {
    const lightness = color.lightness + direction * (step / 100);
    if (lightness < 0 || lightness > 1) {
      break;
    }
    const candidate = withLightness(color, lightness);
    if (contrastRatio(candidate, reference) >= target) {
      return candidate;
    }
  }

  // Unreachable target (a mid-tone background cannot reach 7:1 against any
  // color). Return the best available extreme instead of a half-step.
  const black = { lightness: 0, chroma: 0, hue: color.hue };
  const white = { lightness: 1, chroma: 0, hue: color.hue };
  return contrastRatio(black, reference) >= contrastRatio(white, reference) ? black : white;
}
