import { describe, expect, it } from 'vitest';
import { DEFAULT_DIAGRAM_THEME, isDiagramThemeChoice, resolveDiagramTheme } from './mermaidTheme';

describe('resolveDiagramTheme', () => {
  it('draws in mermaid\u2019s own light and dark themes when following the app', () => {
    expect(DEFAULT_DIAGRAM_THEME).toBe('auto');
    expect(resolveDiagramTheme('auto', 'light')).toBe('default');
    expect(resolveDiagramTheme('auto', 'dark')).toBe('dark');
  });

  it('leaves the app behind once a theme is picked', () => {
    // A chosen theme is drawn whatever the window is doing, which is what the
    // reader asked for by picking it.
    expect(resolveDiagramTheme('forest', 'dark')).toBe('forest');
    expect(resolveDiagramTheme('neo-dark', 'light')).toBe('neo-dark');
  });
});

describe('isDiagramThemeChoice', () => {
  it('accepts a stored choice and refuses anything else', () => {
    expect(isDiagramThemeChoice('auto')).toBe(true);
    expect(isDiagramThemeChoice('redux-dark-color')).toBe(true);
    // Stored preferences outlive the code that wrote them.
    expect(isDiagramThemeChoice('solarized')).toBe(false);
    expect(isDiagramThemeChoice(null)).toBe(false);
    expect(isDiagramThemeChoice(undefined)).toBe(false);
  });
});
