/**
 * The font a diagram is drawn with. The themes it can be drawn in, and how a
 * choice resolves, live in `shared/diagramTheme.ts` with the settings that
 * persist them.
 */

/** The stack the app draws text in, so diagram labels match the UI around them. */
export function diagramFontFamily(): string {
  const family = getComputedStyle(document.body).fontFamily.trim();
  return family === '' ? 'sans-serif' : family;
}

/**
 * What a diagram's labels are measured with: the stack above and the size the
 * app draws body text at. Mermaid bakes both into the drawing it lays out, so a
 * change to either is a different drawing, and this is the key that says so.
 */
export function diagramFontKey(): string {
  const style = getComputedStyle(document.body);
  return `${style.fontFamily}|${style.fontSize}`;
}
