import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  ensureContrast,
  formatHex,
  formatOklch,
  mixOklch,
  normalizeHexColor,
  parseCssColor,
  solveMixAmount,
  type OklchColor,
} from './colorMath';

function require(value: string): OklchColor {
  const parsed = parseCssColor(value);
  if (!parsed) {
    throw new Error(`Unparseable color: ${value}`);
  }
  return parsed;
}

describe('parseCssColor', () => {
  it('parses hex in both lengths', () => {
    expect(formatHex(require('#fff'))).toBe('#ffffff');
    expect(formatHex(require('#1a1c1f'))).toBe('#1a1c1f');
  });

  it('parses rgb() and oklch()', () => {
    expect(formatHex(require('rgb(255, 0, 0)'))).toBe('#ff0000');
    expect(formatHex(require('rgb(0 0 0)'))).toBe('#000000');
    expect(formatHex(require('oklch(100% 0 0)'))).toBe('#ffffff');
    const gray = require('oklch(0.5 0 0)');
    expect(gray.chroma).toBeCloseTo(0, 5);
    expect(gray.lightness).toBeCloseTo(0.5, 3);
  });

  it('rejects unknown formats', () => {
    expect(parseCssColor('rebeccapurple')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});

describe('color conversion', () => {
  it('round-trips sRGB hex values', () => {
    for (const hex of ['#000000', '#ffffff', '#6366f1', '#e0724a', '#0b0b0b']) {
      expect(formatHex(require(hex))).toBe(hex);
    }
  });

  it('formats oklch for CSS', () => {
    expect(formatOklch({ lightness: 0.5, chroma: 0.1, hue: 30 })).toBe(
      'oklch(50.00% 0.1000 30.00)',
    );
  });

  it('normalizes user input', () => {
    expect(normalizeHexColor('  rgb(255 255 255) ')).toBe('#ffffff');
    expect(normalizeHexColor('nope')).toBeNull();
  });
});

describe('contrast', () => {
  it('matches known WCAG pairs', () => {
    expect(contrastRatio(require('#000000'), require('#ffffff'))).toBeCloseTo(21, 1);
    expect(contrastRatio(require('#ffffff'), require('#ffffff'))).toBeCloseTo(1, 5);
    expect(contrastRatio(require('#1a1c1f'), require('#ffffff'))).toBeCloseTo(17.08, 1);
    expect(contrastRatio(require('#6366f1'), require('#ffffff'))).toBeCloseTo(4.47, 1);
  });

  it('is symmetric', () => {
    const a = require('#166534');
    const b = require('#ffffff');
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe('mixing', () => {
  it('returns the endpoints at 0 and 1', () => {
    const black = require('#000000');
    const white = require('#ffffff');
    expect(formatHex(mixOklch(black, white, 0))).toBe('#000000');
    expect(formatHex(mixOklch(black, white, 1))).toBe('#ffffff');
  });

  it('solves the smallest mix that reaches a target', () => {
    const background = require('#ffffff');
    const foreground = require('#1a1c1f');
    const amount = solveMixAmount(background, foreground, background, 1.3);
    const mixed = mixOklch(background, foreground, amount);
    expect(contrastRatio(mixed, background)).toBeCloseTo(1.3, 2);
    expect(solveMixAmount(background, foreground, background, 1.0)).toBe(0);
  });
});

describe('ensureContrast', () => {
  it('leaves colors that already pass untouched', () => {
    const foreground = require('#1a1c1f');
    expect(formatHex(ensureContrast(foreground, require('#ffffff'), 7))).toBe('#1a1c1f');
  });

  it('darkens against a light reference and lightens against a dark one', () => {
    const lightResult = ensureContrast(require('#aaaaaa'), require('#ffffff'), 7);
    expect(contrastRatio(lightResult, require('#ffffff'))).toBeGreaterThanOrEqual(6.99);

    const darkResult = ensureContrast(require('#555555'), require('#0b0b0b'), 7);
    expect(contrastRatio(darkResult, require('#0b0b0b'))).toBeGreaterThanOrEqual(6.99);
  });

  it('keeps hue while moving lightness', () => {
    const source = require('#c05050');
    const result = ensureContrast(source, require('#ffffff'), 7);
    expect(result.hue).toBeCloseTo(source.hue, 0);
  });
});
