/**
 * The themes a diagram can be drawn in, and the font it is drawn with.
 *
 * A diagram is drawn in mermaid's own palette rather than in the app's: the
 * app's greys are chrome, and a diagram painted from them reads as a diagram of
 * the app instead of a diagram of its subject. Mermaid has one palette per
 * theme, so what the app picks is which theme to draw in — mermaid's light one
 * in a light window and its dark one in a dark window, unless the reader has
 * asked for a particular theme of their own.
 *
 * The names are mermaid's, and the labels are what a settings page would show
 * for them.
 */
export const DIAGRAM_THEME_CHOICES = [
  { value: 'auto', label: 'Follow the app' },
  { value: 'default', label: 'Mermaid default' },
  { value: 'dark', label: 'Mermaid dark' },
  { value: 'forest', label: 'Forest' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'base', label: 'Base' },
  { value: 'neo', label: 'Neo' },
  { value: 'neo-dark', label: 'Neo dark' },
  { value: 'redux', label: 'Redux' },
  { value: 'redux-dark', label: 'Redux dark' },
  { value: 'redux-color', label: 'Redux colour' },
  { value: 'redux-dark-color', label: 'Redux dark colour' },
  { value: 'null', label: 'No theme' },
] as const;

/** What the reader may ask for, `auto` included. */
export type DiagramThemeChoice = (typeof DIAGRAM_THEME_CHOICES)[number]['value'];

/** A theme mermaid itself knows, which is what a choice resolves to. */
export type DiagramTheme = Exclude<DiagramThemeChoice, 'auto'>;

export const DEFAULT_DIAGRAM_THEME: DiagramThemeChoice = 'auto';

const CHOICE_VALUES = new Set<string>(DIAGRAM_THEME_CHOICES.map((choice) => choice.value));

/** Guards a value that came from outside, such as a stored preference. */
export function isDiagramThemeChoice(value: unknown): value is DiagramThemeChoice {
  return typeof value === 'string' && CHOICE_VALUES.has(value);
}

/** The theme to draw in, given what the reader asked for and the window's own. */
export function resolveDiagramTheme(
  choice: DiagramThemeChoice,
  appTheme: 'light' | 'dark',
): DiagramTheme {
  if (choice !== 'auto') {
    return choice;
  }

  return appTheme === 'dark' ? 'dark' : 'default';
}

/** The stack the app draws text in, so diagram labels match the UI around them. */
export function diagramFontFamily(): string {
  const family = getComputedStyle(document.body).fontFamily.trim();
  return family === '' ? 'sans-serif' : family;
}

// The colours diagrams used to be drawn with, kept for the day the app's own
// palette is wanted again. Mermaid's themes are what a diagram is drawn in now
// (see `resolveDiagramTheme` above): a diagram painted out of the app's greys
// ends up reading as a diagram of the app rather than of its subject.
//
// To bring it back: uncomment the import and everything under it, and pass the
// values to mermaid in `configFor` (`lib/mermaidRenderer.ts`) as
// `themeVariables: appThemeVariables()`. The theme stays the one
// `resolveDiagramTheme` picked, and these values are laid over it; nothing else
// changes, because the drawing already depends on the theme it was drawn in.
//
// The canvas conversion is not optional: mermaid derives its lighter and darker
// shades from whatever it is handed, which needs plain sRGB, and the app's
// tokens are `oklch()` and `color-mix()`. The browser test that read the tokens
// back out of the document was dropped with this, and can come back the same
// way.
// import type { MermaidConfig } from 'mermaid';
//
// /**
//  * The app's tokens as mermaid's theme variables.
//  *
//  * Mermaid asks for a lot: node fills, edge colours, and one set per diagram
//  * kind. The values below are the ones that decide whether a diagram looks like
//  * part of the app or like a foreign object — a node fill from the app's own
//  * surface tokens, text from its foreground, structure from its borders. Anything
//  * left out keeps the tuned value of the theme mermaid is set to.
//  *
//  * `background` is the muted surface, because that is what the diagram sits on:
//  * the block around it is a code block, and a node filled with a muted token on a
//  * muted block would read as a hole.
//  */
// const TOKEN_BY_VARIABLE: Record<string, string> = {
//   background: '--muted',
//   primaryColor: '--card',
//   primaryTextColor: '--foreground',
//   primaryBorderColor: '--border',
//   secondaryColor: '--card',
//   secondaryTextColor: '--foreground',
//   secondaryBorderColor: '--border',
//   tertiaryColor: '--muted',
//   tertiaryTextColor: '--foreground',
//   tertiaryBorderColor: '--border',
//   mainBkg: '--card',
//   nodeBorder: '--border',
//   clusterBkg: '--card',
//   clusterBorder: '--border',
//   lineColor: '--muted-foreground',
//   textColor: '--foreground',
//   titleColor: '--foreground',
//   edgeLabelBackground: '--card',
//   noteBkgColor: '--card',
//   noteTextColor: '--foreground',
//   noteBorderColor: '--border',
//   actorBkg: '--card',
//   actorBorder: '--border',
//   actorTextColor: '--foreground',
//   actorLineColor: '--muted-foreground',
//   signalColor: '--muted-foreground',
//   signalTextColor: '--foreground',
//   labelBoxBkgColor: '--card',
//   labelBoxBorderColor: '--border',
//   labelTextColor: '--foreground',
//   loopTextColor: '--foreground',
//   activationBkgColor: '--secondary',
//   activationBorderColor: '--border',
//   sequenceNumberColor: '--card',
//   sectionBkgColor: '--muted',
//   sectionBkgColor2: '--muted',
//   taskBkgColor: '--card',
//   taskBorderColor: '--border',
//   taskTextColor: '--foreground',
//   taskTextOutsideColor: '--foreground',
//   gridColor: '--border',
//   classText: '--foreground',
// };
//
// /**
//  * Resolve a colour for mermaid, or nothing if it cannot be read as one.
//  *
//  * Mermaid derives shades from the colours it is handed (lighter edges, darker
//  * borders), which means they have to be plain sRGB: the app's tokens are
//  * `oklch()` and `color-mix()`. Painting one pixel on a canvas is the only
//  * conversion the platform offers that understands every colour syntax the
//  * renderer itself accepts.
//  */
// export function resolveColor(value: string): string | null {
//   const color = value.trim();
//   if (color === '' || typeof CSS === 'undefined' || !CSS.supports('color', color)) {
//     return null;
//   }
//
//   const context = colorContext();
//   if (context === null) {
//     return null;
//   }
//
//   context.clearRect(0, 0, 1, 1);
//   context.fillStyle = color;
//   context.fillRect(0, 0, 1, 1);
//   const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
//   if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
//     return null;
//   }
//   if (alpha === 255) {
//     return `rgb(${red} ${green} ${blue})`;
//   }
//
//   // A translucent token was painted over a cleared pixel, so the bytes that come
//   // back are the colour, not premultiplied by anything.
//   return `rgb(${red} ${green} ${blue} / ${(alpha / 255).toFixed(3)})`;
// }
//
// let sharedContext: CanvasRenderingContext2D | null | undefined;
//
// function colorContext(): CanvasRenderingContext2D | null {
//   if (sharedContext === undefined) {
//     const canvas = document.createElement('canvas');
//     canvas.width = 1;
//     canvas.height = 1;
//     sharedContext = canvas.getContext('2d', { willReadFrequently: true });
//   }
//
//   return sharedContext;
// }
//
// /** The stack the app draws text in, so diagram labels match the UI around them. */
// export function diagramFontFamily(): string {
//   const family = getComputedStyle(document.body).fontFamily.trim();
//   return family === '' ? 'sans-serif' : family;
// }
//
// /**
//  * The theme variables for the app's current theme, read from the document: the
//  * theme lives in CSS custom properties, so the only way to know what colour
//  * `--border` is right now is to ask for its computed value.
//  */
// export function appThemeVariables(): ThemeVariables {
//   const styles = getComputedStyle(document.documentElement);
//   return themeVariablesFrom((token) => resolveColor(styles.getPropertyValue(token)));
// }
//
// /** Pure half of {@link appThemeVariables}, for tests and for reuse. */
// export function themeVariablesFrom(resolveToken: (token: string) => string | null): ThemeVariables {
//   const variables: ThemeVariables = {};
//   for (const [variable, token] of Object.entries(TOKEN_BY_VARIABLE)) {
//     const resolved = resolveToken(token);
//     if (resolved !== null) {
//       variables[variable] = resolved;
//     }
//   }
//
//   return variables;
// }
