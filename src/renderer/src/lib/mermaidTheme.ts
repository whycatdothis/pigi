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
