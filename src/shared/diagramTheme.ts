/**
 * The themes a mermaid diagram can be drawn in.
 *
 * A diagram is drawn in mermaid's own palette rather than in the app's: the
 * app's greys are chrome, and a diagram painted from them reads as a diagram of
 * the app instead of a diagram of its subject. Mermaid has one palette per
 * theme, so what the reader picks is which palette to draw in, whatever mode the
 * window is in.
 *
 * Shared because the choice is persisted in pigi's settings file; the names are
 * mermaid's, and the labels are what the settings page shows for them.
 */
export const DIAGRAM_THEME_CHOICES = [
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

/** What the reader may ask for. */
export type DiagramThemeChoice = (typeof DIAGRAM_THEME_CHOICES)[number]['value'];

/** A theme mermaid itself knows. */
export type DiagramTheme = DiagramThemeChoice;

export const DEFAULT_DIAGRAM_THEME: DiagramThemeChoice = 'default';

const CHOICE_VALUES = new Set<string>(DIAGRAM_THEME_CHOICES.map((choice) => choice.value));

/** Guards a value that came from outside, such as the settings file. */
export function isDiagramThemeChoice(value: unknown): value is DiagramThemeChoice {
  return typeof value === 'string' && CHOICE_VALUES.has(value);
}
