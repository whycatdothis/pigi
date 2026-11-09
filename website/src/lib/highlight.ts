// Each token carries both modes' colours; global.css picks one by mode.
import { codeToTokens, type BundledLanguage } from 'shiki';
import { codeThemePresetFor, DEFAULT_CODE_THEME_ID } from '../../../src/shared/codeTheme';

export interface Token {
  content: string;
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
