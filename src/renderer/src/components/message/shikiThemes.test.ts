// @vitest-environment node
/**
 * The code theme pipeline end to end: pick a base theme from the background,
 * retint its tokens, and tokenize real code. The unit-level rules live in
 * `src/shared/codeTheme.test.ts`; this checks that Shiki accepts the retinted
 * registration and that every painted token clears the floor.
 */
import { describe, expect, it } from 'vitest';
import { createHighlighter } from 'shiki/bundle/full';
import { codeThemeNameFor, loadCodeTheme } from './shikiThemes';
import { contrastRatio, parseCssColor } from '../../../../shared/colorMath';

async function paintedColors(background: string, surface: string): Promise<string[]> {
  const theme = await loadCodeTheme(background, surface);
  const highlighter = await createHighlighter({
    themes: [theme.registration],
    langs: ['typescript'],
  });
  const result = highlighter.codeToTokens(
    '// comment\nconst answer: number = 42;\nconsole.log("hello");\n',
    { lang: 'typescript', theme: theme.name },
  );
  return result.tokens
    .flat()
    .map((token) => token.color)
    .filter((color): color is string => typeof color === 'string');
}

function ratioAgainst(color: string, surface: string): number {
  const foreground = parseCssColor(color);
  const background = parseCssColor(surface);
  if (!foreground || !background) {
    throw new Error(`Unparseable color: ${color}`);
  }
  return contrastRatio(foreground, background);
}

describe('codeThemeNameFor', () => {
  it('follows the background luminance', () => {
    expect(codeThemeNameFor('#ffffff', '#f5f5f6')).toContain('one-light');
    expect(codeThemeNameFor('#0b0b0b', '#262626')).toContain('one-dark-pro');
  });
});

describe('loadCodeTheme', () => {
  it('paints every token above 3:1 on a light surface', async () => {
    const colors = await paintedColors('#ffffff', '#f5f5f6');
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      expect(ratioAgainst(color, '#f5f5f6')).toBeGreaterThan(2.9);
    }
  }, 20_000);

  it('paints every token above 3:1 on a dark surface', async () => {
    const colors = await paintedColors('#0b0b0b', '#262626');
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      expect(ratioAgainst(color, '#262626')).toBeGreaterThan(2.9);
    }
  }, 20_000);
});
