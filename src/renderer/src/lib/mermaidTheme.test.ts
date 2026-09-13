import { describe, expect, it } from 'vitest';
import { themeVariablesFrom } from './mermaidTheme';

/**
 * The mapping from the app's tokens to mermaid's theme variables. Reading the
 * tokens needs a document and turning `oklch()` into sRGB needs a canvas, so
 * that half is a browser test; what is checked here is what the two halves do
 * with the values they are handed.
 */
describe('themeVariablesFrom', () => {
  const tokens: Record<string, string> = {
    '--muted': 'rgb(240 240 240)',
    '--card': 'rgb(255 255 255)',
    '--foreground': 'rgb(26 28 31)',
    '--border': 'rgb(230 230 230)',
    '--muted-foreground': 'rgb(138 138 138)',
    '--secondary': 'rgb(247 247 247)',
  };

  it('fills the variables a diagram is drawn from', () => {
    const variables = themeVariablesFrom((token) => tokens[token] ?? null);

    expect(variables.primaryColor).toBe(tokens['--card']);
    expect(variables.primaryTextColor).toBe(tokens['--foreground']);
    expect(variables.primaryBorderColor).toBe(tokens['--border']);
    expect(variables.lineColor).toBe(tokens['--muted-foreground']);
    expect(variables.textColor).toBe(tokens['--foreground']);
    // The surface the diagram sits on is the block's own background, not the
    // card: a muted node fill on a muted block would read as a hole.
    expect(variables.background).toBe(tokens['--muted']);
  });

  it('leaves out a variable whose token cannot be resolved', () => {
    const variables = themeVariablesFrom((token) =>
      token === '--card' ? null : (tokens[token] ?? null),
    );

    expect(variables.primaryColor).toBeUndefined();
    expect(variables.mainBkg).toBeUndefined();
    // Its neighbours are unaffected: mermaid keeps its own value for the one
    // that could not be read, and the diagram is drawn from the rest.
    expect(variables.primaryTextColor).toBe(tokens['--foreground']);
    expect(variables.lineColor).toBe(tokens['--muted-foreground']);
  });
});
