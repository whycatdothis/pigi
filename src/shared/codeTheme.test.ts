import { describe, expect, it } from 'vitest';
import { codeThemeForBackground, retintTokenColors } from './codeTheme';
import { contrastRatio, parseCssColor } from './colorMath';

function ratio(foreground: string, background: string): number {
  const foregroundColor = parseCssColor(foreground);
  const backgroundColor = parseCssColor(background);
  if (!foregroundColor || !backgroundColor) {
    throw new Error(`Unparseable color: ${foreground} / ${background}`);
  }
  return contrastRatio(foregroundColor, backgroundColor);
}

describe('codeThemeForBackground', () => {
  it('picks the base theme by measured luminance', () => {
    expect(codeThemeForBackground('#ffffff')).toBe('one-light');
    expect(codeThemeForBackground('#f6f1e8')).toBe('one-light');
    expect(codeThemeForBackground('#808080')).toBe('one-light');
    expect(codeThemeForBackground('#1f2430')).toBe('one-dark-pro');
    expect(codeThemeForBackground('#0b0b0b')).toBe('one-dark-pro');
  });
});

describe('retintTokenColors', () => {
  const surface = '#f5f5f6';

  it('lifts colors below the floor and keeps hue', () => {
    const [comment] = retintTokenColors([{ settings: { foreground: '#a0a1a7' } }], surface) ?? [];
    const foreground = comment.settings.foreground ?? '';
    expect(ratio(foreground, surface)).toBeGreaterThanOrEqual(2.99);
    const before = parseCssColor('#a0a1a7');
    const after = parseCssColor(foreground);
    expect(after?.hue).toBeCloseTo(before?.hue ?? 0, 0);
  });

  it('leaves colors that already pass untouched', () => {
    expect(ratio('#2f6f2f', surface)).toBeGreaterThan(3);
    const [string] =
      retintTokenColors(
        [{ scope: 'string', settings: { foreground: '#2f6f2f', fontStyle: 'italic' } }],
        surface,
      ) ?? [];
    expect(string.settings.foreground).toBe('#2f6f2f');
    expect(string.settings.fontStyle).toBe('italic');
    expect(string.scope).toBe('string');
  });

  it('keeps entries without a foreground', () => {
    const entries = retintTokenColors([{ settings: { fontStyle: 'bold' } }], surface) ?? [];
    expect(entries[0].settings).toEqual({ fontStyle: 'bold' });
  });

  it('works on a dark surface', () => {
    const [comment] = retintTokenColors([{ settings: { foreground: '#5c6370' } }], '#262626') ?? [];
    expect(ratio(comment.settings.foreground ?? '', '#262626')).toBeGreaterThanOrEqual(2.99);
  });
});
