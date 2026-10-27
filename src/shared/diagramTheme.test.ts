import { describe, expect, it } from 'vitest';
import { DEFAULT_DIAGRAM_THEME, isDiagramThemeChoice } from './diagramTheme';

describe('DEFAULT_DIAGRAM_THEME', () => {
  it('draws in mermaid\u2019s own light theme', () => {
    expect(DEFAULT_DIAGRAM_THEME).toBe('default');
  });
});

describe('isDiagramThemeChoice', () => {
  it('accepts a stored choice and refuses anything else', () => {
    expect(isDiagramThemeChoice('default')).toBe(true);
    expect(isDiagramThemeChoice('redux-dark-color')).toBe(true);
    // Stored preferences outlive the code that wrote them.
    expect(isDiagramThemeChoice('auto')).toBe(false);
    expect(isDiagramThemeChoice('solarized')).toBe(false);
    expect(isDiagramThemeChoice(null)).toBe(false);
    expect(isDiagramThemeChoice(undefined)).toBe(false);
  });
});
