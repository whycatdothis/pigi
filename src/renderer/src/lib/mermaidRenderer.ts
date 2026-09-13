import mermaid, { type MermaidConfig } from 'mermaid';
import { appThemeVariables, diagramFontFamily, type DiagramTheme } from './mermaidTheme';

export interface RenderedDiagram {
  /** Mermaid's own markup, which is what the drawing is made of. */
  svg: string;
  /** The size mermaid laid it out at, read from the markup's viewBox. */
  width: number;
  height: number;
}

export type DiagramOutcome =
  | { ok: true; diagram: RenderedDiagram }
  | { ok: false; message: string };

/**
 * How many diagrams to keep. A transcript holds a handful, but the same diagram
 * is asked for again whenever a row scrolls back into the window, and a theme
 * switch asks for all of them at once.
 */
const CACHE_LIMIT = 32;

/** Rendered diagrams, oldest first: the map is both the cache and its order. */
const cache = new Map<string, DiagramOutcome>();

let renderCount = 0;
let initializedTheme: DiagramTheme | null = null;

/**
 * Mermaid keeps its working state and its configuration on the module, so a
 * render is only safe once the one before it has finished. Every caller awaits
 * its turn here instead of racing (which is what mermaid does not support).
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Render a diagram, or report why it could not be rendered.
 *
 * Rejections are turned into a result on purpose: a diagram the model wrote
 * wrongly is an ordinary outcome in a chat, not something to catch per caller.
 */
export async function renderDiagram(code: string, theme: DiagramTheme): Promise<DiagramOutcome> {
  const key = `${theme}\u0000${code}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const pending = queue.then(() => renderUncached(code, theme));
  queue = pending.then(
    () => undefined,
    () => undefined,
  );
  const outcome = await pending;

  cache.set(key, outcome);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  return outcome;
}

/**
 * A diagram this module has already drawn, for a caller that mounts into an
 * existing one: a virtualized row scrolling back into the window draws itself in
 * the first frame instead of showing its source again.
 */
export function peekDiagram(code: string, theme: DiagramTheme): RenderedDiagram | null {
  const cached = cache.get(`${theme}\u0000${code}`);
  return cached?.ok === true ? cached.diagram : null;
}

async function renderUncached(code: string, theme: DiagramTheme): Promise<DiagramOutcome> {
  try {
    if (initializedTheme !== theme) {
      mermaid.initialize(configFor(theme));
      initializedTheme = theme;
    }

    // Labels are measured while rendering, so the app's font has to be there
    // before the first diagram: a fallback font gives different box sizes.
    await document.fonts.ready;

    renderCount += 1;
    const { svg } = await mermaid.render(`pigi-mermaid-${String(renderCount)}`, code);
    return { ok: true, diagram: { svg, ...readSvgSize(svg) } };
  } catch (error) {
    return { ok: false, message: firstLine(error) };
  }
}

function configFor(theme: DiagramTheme): MermaidConfig {
  return {
    startOnLoad: false,
    // The diagram text comes from a model, so its output is treated as hostile:
    // strict mode is what keeps it inert, and mermaid's own `secure` list
    // already refuses `%%{init: …}%%` overrides of this and of the limits below.
    securityLevel: 'strict',
    // A diagram that fails to parse must not append mermaid's error graphic to
    // the document, where it would sit outside the transcript and never leave.
    suppressErrorRendering: true,
    theme: theme === 'dark' ? 'dark' : 'default',
    fontFamily: diagramFontFamily(),
    themeVariables: appThemeVariables(),
  };
}

/**
 * The size mermaid laid the diagram out at, taken from the viewBox it writes.
 * The root `width`/`height` are percentages, so they say nothing about how big
 * the drawing is.
 */
function readSvgSize(svg: string): { width: number; height: number } {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (viewBox === undefined) {
    return { width: 0, height: 0 };
  }

  const values = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = Math.abs(values[2] ?? 0);
  const height = Math.abs(values[3] ?? 0);
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

/**
 * Mermaid's parse errors carry the diagram text back in the message, a line per
 * row: only the sentence that says what is wrong is worth showing.
 */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0]?.trim() ?? '';
}
