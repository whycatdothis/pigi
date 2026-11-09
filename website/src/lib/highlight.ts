/**
 * Syntax highlighting for the file and diff stills, at build time.
 *
 * Shiki with the app's default code theme (`one` in `src/shared/codeTheme.ts`:
 * One Light by day, One Dark Pro at night). Each token carries both colours as
 * custom properties and `global.css` picks one by theme, so a still follows the
 * page's mode without a second render.
 */
import { codeToTokens, type BundledLanguage } from 'shiki';
import { codeThemePresetFor, DEFAULT_CODE_THEME_ID } from '../../../src/shared/codeTheme';

export interface Token {
  content: string;
  /** `--shiki-light:…;--shiki-dark:…`, for a `style` attribute. */
  style: string;
}

const theme = codeThemePresetFor(DEFAULT_CODE_THEME_ID);

export async function highlightLines(code: string, lang: BundledLanguage): Promise<Token[][]> {
  const { tokens } = await codeToTokens(code, {
    lang,
    themes: { light: theme.light, dark: theme.dark },
    defaultColor: false,
  });
  return tokens.map((line) =>
    line.map((token) => ({
      content: token.content,
      style: Object.entries(token.htmlStyle ?? {})
        .map(([name, value]) => `${name}:${value}`)
        .join(';'),
    })),
  );
}
