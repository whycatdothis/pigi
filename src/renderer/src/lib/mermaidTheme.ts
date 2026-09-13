import type { MermaidConfig } from 'mermaid';

export type DiagramTheme = 'light' | 'dark';

export type ThemeVariables = NonNullable<MermaidConfig['themeVariables']>;

/**
 * The app's tokens as mermaid's theme variables.
 *
 * Mermaid asks for a lot: node fills, edge colours, and one set per diagram
 * kind. The values below are the ones that decide whether a diagram looks like
 * part of the app or like a foreign object — a node fill from the app's own
 * surface tokens, text from its foreground, structure from its borders. Anything
 * left out keeps the tuned value of the theme mermaid is set to.
 *
 * `background` is the muted surface, because that is what the diagram sits on:
 * the block around it is a code block, and a node filled with a muted token on a
 * muted block would read as a hole.
 */
const TOKEN_BY_VARIABLE: Record<string, string> = {
  background: '--muted',
  primaryColor: '--card',
  primaryTextColor: '--foreground',
  primaryBorderColor: '--border',
  secondaryColor: '--card',
  secondaryTextColor: '--foreground',
  secondaryBorderColor: '--border',
  tertiaryColor: '--muted',
  tertiaryTextColor: '--foreground',
  tertiaryBorderColor: '--border',
  mainBkg: '--card',
  nodeBorder: '--border',
  clusterBkg: '--card',
  clusterBorder: '--border',
  lineColor: '--muted-foreground',
  textColor: '--foreground',
  titleColor: '--foreground',
  edgeLabelBackground: '--card',
  noteBkgColor: '--card',
  noteTextColor: '--foreground',
  noteBorderColor: '--border',
  actorBkg: '--card',
  actorBorder: '--border',
  actorTextColor: '--foreground',
  actorLineColor: '--muted-foreground',
  signalColor: '--muted-foreground',
  signalTextColor: '--foreground',
  labelBoxBkgColor: '--card',
  labelBoxBorderColor: '--border',
  labelTextColor: '--foreground',
  loopTextColor: '--foreground',
  activationBkgColor: '--secondary',
  activationBorderColor: '--border',
  sequenceNumberColor: '--card',
  sectionBkgColor: '--muted',
  sectionBkgColor2: '--muted',
  taskBkgColor: '--card',
  taskBorderColor: '--border',
  taskTextColor: '--foreground',
  taskTextOutsideColor: '--foreground',
  gridColor: '--border',
  classText: '--foreground',
};

/**
 * Resolve a colour for mermaid, or nothing if it cannot be read as one.
 *
 * Mermaid derives shades from the colours it is handed (lighter edges, darker
 * borders), which means they have to be plain sRGB: the app's tokens are
 * `oklch()` and `color-mix()`. Painting one pixel on a canvas is the only
 * conversion the platform offers that understands every colour syntax the
 * renderer itself accepts.
 */
export function resolveColor(value: string): string | null {
  const color = value.trim();
  if (color === '' || typeof CSS === 'undefined' || !CSS.supports('color', color)) {
    return null;
  }

  const context = colorContext();
  if (context === null) {
    return null;
  }

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    return null;
  }
  if (alpha === 255) {
    return `rgb(${red} ${green} ${blue})`;
  }

  // A translucent token was painted over a cleared pixel, so the bytes that come
  // back are the colour, not premultiplied by anything.
  return `rgb(${red} ${green} ${blue} / ${(alpha / 255).toFixed(3)})`;
}

let sharedContext: CanvasRenderingContext2D | null | undefined;

function colorContext(): CanvasRenderingContext2D | null {
  if (sharedContext === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    sharedContext = canvas.getContext('2d', { willReadFrequently: true });
  }

  return sharedContext;
}

/** The stack the app draws text in, so diagram labels match the UI around them. */
export function diagramFontFamily(): string {
  const family = getComputedStyle(document.body).fontFamily.trim();
  return family === '' ? 'sans-serif' : family;
}

/**
 * The theme variables for the app's current theme, read from the document: the
 * theme lives in CSS custom properties, so the only way to know what colour
 * `--border` is right now is to ask for its computed value.
 */
export function appThemeVariables(): ThemeVariables {
  const styles = getComputedStyle(document.documentElement);
  return themeVariablesFrom((token) => resolveColor(styles.getPropertyValue(token)));
}

/** Pure half of {@link appThemeVariables}, for tests and for reuse. */
export function themeVariablesFrom(resolveToken: (token: string) => string | null): ThemeVariables {
  const variables: ThemeVariables = {};
  for (const [variable, token] of Object.entries(TOKEN_BY_VARIABLE)) {
    const resolved = resolveToken(token);
    if (resolved !== null) {
      variables[variable] = resolved;
    }
  }

  return variables;
}
