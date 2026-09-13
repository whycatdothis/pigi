import {
  DEFAULT_DIAGRAM_THEME,
  isDiagramThemeChoice,
  type DiagramThemeChoice,
} from './mermaidTheme';

/**
 * Where the reader's choice of diagram theme is remembered, until a settings
 * page has a store of its own to keep it in.
 *
 * The key is namespaced like the theme provider's, which is the other thing
 * this window remembers locally.
 */
const STORAGE_KEY = 'pigi:diagram-theme';

/** The stored choice, or the default if there is none or it cannot be read. */
export function readDiagramThemePreference(): DiagramThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isDiagramThemeChoice(stored) ? stored : DEFAULT_DIAGRAM_THEME;
  } catch {
    // A window that refuses storage simply has no preference to remember.
    return DEFAULT_DIAGRAM_THEME;
  }
}

export function writeDiagramThemePreference(choice: DiagramThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // The choice still holds for this window; it just will not outlive it.
  }
}
