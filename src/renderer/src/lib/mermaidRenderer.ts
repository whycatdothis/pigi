import mermaid, { type MermaidConfig } from 'mermaid';
import { appThemeVariables, diagramFontFamily, type DiagramTheme } from './mermaidTheme';

export interface RenderedDiagram {
  /** Mermaid's own markup, which is what the drawing is made of. */
  svg: string;
  /**
   * Mermaid's stylesheet for this drawing, with its rules scoped to
   * `styleScope`, or null when it could not be rewritten and is still inside
   * the markup.
   */
  styles: string | null;
  /** The scope `styles` is written for, which the markup carries as an attribute. */
  styleScope: string | null;
  /** The size mermaid laid it out at, read from the markup's viewBox. */
  width: number;
  height: number;
}

const SCOPE_PLACEHOLDER = '\u0000scope\u0000';

/** Marks a drawing, and its stylesheet, as belonging to one set of rules. */
const SCOPE_ATTRIBUTE = 'data-mermaid-scope';

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
 * Renders that are under way, by key. Two callers asking for the same diagram
 * at the same time — which is what a component mounted twice does — get one
 * drawing rather than two, and with it the same markup: a caller that mounts
 * into an element another caller is already drawing into is not left holding a
 * drawing that the next one replaces.
 */
const inFlight = new Map<string, Promise<DiagramOutcome>>();

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

  const started = inFlight.get(key);
  if (started !== undefined) {
    return started;
  }

  const pending = queue
    .then(() => renderUncached(code, theme, key))
    .then((outcome) => {
      cache.set(key, outcome);
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
      return outcome;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  queue = pending.then(
    () => undefined,
    () => undefined,
  );
  inFlight.set(key, pending);

  return pending;
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

async function renderUncached(
  code: string,
  theme: DiagramTheme,
  key: string,
): Promise<DiagramOutcome> {
  try {
    if (initializedTheme !== theme) {
      mermaid.initialize(configFor(theme));
      initializedTheme = theme;
    }

    // Labels are measured while rendering, so the app's font has to be there
    // before the first diagram: a fallback font gives different box sizes.
    await document.fonts.ready;

    renderCount += 1;
    const renderId = `pigi-mermaid-${String(renderCount)}`;
    const { svg } = await mermaid.render(renderId, code);
    // The name mermaid draws under says which render this was, and a render is
    // not a thing the drawing is: the markup of a diagram is named after the
    // diagram, so that the same source in the same theme is the same markup
    // however often it is drawn, and a caller can mount it without a redraw
    // taking the drawing out from under it.
    return { ok: true, diagram: prepareDiagram(svg, renderId, `pigi-mermaid-${hashString(key)}`) };
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
 * Take mermaid's markup apart into the drawing and the rules that style it.
 *
 * Mermaid hands back a page of its own: a stylesheet scoped to the id it drew
 * the diagram under, and a root sized to fill that page. What a caller mounts is
 * a block in the transcript, so the rules are lifted out to be shared (see
 * `ensureDiagramStyles`), the root is given the size it was laid out at, and the
 * inline `max-width` that would tie it back to that page is dropped.
 */
function prepareDiagram(markup: string, renderId: string, diagramId: string): RenderedDiagram {
  const holder = document.createElement('div');
  holder.innerHTML = markup.split(renderId).join(diagramId);
  const root = holder.querySelector('svg');
  const styleElement = root?.querySelector('style') ?? null;
  const rules = styleElement?.textContent ?? '';
  const scoped = root === null ? null : scopeRules(rules, diagramId);
  const size = readSvgSize(markup);

  if (root !== null) {
    root.setAttribute('width', String(size.width));
    root.setAttribute('height', String(size.height));
    root.removeAttribute('style');
  }
  if (root !== null && scoped !== null) {
    root.setAttribute(SCOPE_ATTRIBUTE, scoped.scope);
    styleElement?.remove();
  }

  return {
    svg: holder.innerHTML,
    styles: scoped?.rules ?? null,
    styleScope: scoped?.scope ?? null,
    ...size,
  };
}

/**
 * Rewrite mermaid's stylesheet so that one copy of it serves every diagram drawn
 * with the same rules.
 *
 * Mermaid writes its rules for the id it drew under (`#pigi-mermaid-3 .node`),
 * which is why every diagram carries a copy of the same few kilobytes. Those
 * rules depend on the diagram's kind and the theme and nothing else, so the id
 * is replaced by the scope attribute its markup carries, and the animations are
 * renamed after that scope: two kinds of diagram may well define a name like
 * `dash` differently.
 *
 * Returns null for a stylesheet this cannot rewrite safely, and the caller then
 * leaves mermaid's own copy in the markup.
 */
function scopeRules(rules: string, rootId: string): { scope: string; rules: string } | null {
  if (rootId === '' || !rules.includes(`#${rootId}`)) {
    return null;
  }

  const normalized = rules.split(`#${rootId}`).join(SCOPE_PLACEHOLDER);
  // An id that is referred to without its `#` would end up as a selector in the
  // middle of a value, which is not something to guess at.
  if (normalized.includes(rootId)) {
    return null;
  }

  const scope = `mermaid-${hashString(normalized)}`;
  let scoped = normalized.split(SCOPE_PLACEHOLDER).join(`[${SCOPE_ATTRIBUTE}="${scope}"]`);
  const animations = animationNames(normalized);
  if (animations.length > 0) {
    const pattern = new RegExp(`(?<![\\w-])(${animations.map(escaped).join('|')})(?![\\w-])`, 'g');
    scoped = scoped.replace(pattern, (name) => `${name}-${scope}`);
  }

  return { scope, rules: scoped };
}

/** The animation names a stylesheet defines, for renaming them per scope. */
function animationNames(rules: string): string[] {
  return [...rules.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A stable key for a set of rules, so identical ones are recognised as such. */
function hashString(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Put a drawing's rules into the document, once, however many drawings are made
 * with them. Scopes are kept for the life of the window: there are as many of
 * them as there are kinds of diagram and themes.
 */
export function ensureDiagramStyles(styles: string, scope: string): void {
  if (document.head.querySelector(`style[${SCOPE_ATTRIBUTE}="${scope}"]`) !== null) {
    return;
  }

  const element = document.createElement('style');
  element.setAttribute(SCOPE_ATTRIBUTE, scope);
  element.textContent = styles;
  document.head.append(element);
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
