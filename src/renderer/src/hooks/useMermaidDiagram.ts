import { useEffect, useState } from 'react';
import { peekDiagram, renderDiagram, type RenderedDiagram } from '../lib/mermaidRenderer';
import type { DiagramTheme } from '../lib/mermaidTheme';

export type MermaidDiagramState =
  | { status: 'loading' }
  | { status: 'ready'; diagram: RenderedDiagram }
  | { status: 'failed'; message: string };

interface RenderedEntry {
  key: string;
  state: MermaidDiagramState;
}

/**
 * The rendered form of a diagram's source, for as long as it takes to draw it.
 *
 * Rendering is asynchronous (mermaid measures the text it lays out), so a caller
 * gets a state rather than an SVG. Both the source and the theme are keys: a
 * theme switch redraws the diagram, and the module underneath remembers the
 * result, so a row scrolling back into the window is drawn again without ever
 * having shown the source in between.
 */
export function useMermaidDiagram(code: string, theme: DiagramTheme): MermaidDiagramState {
  const key = `${theme}\u0000${code}`;
  const [rendered, setRendered] = useState<RenderedEntry | null>(() => {
    const cached = peekDiagram(code, theme);
    return cached === null ? null : { key, state: { status: 'ready', diagram: cached } };
  });

  useEffect(() => {
    let active = true;

    void renderDiagram(code, theme).then((outcome) => {
      if (!active) {
        return;
      }

      setRendered({
        key,
        state: outcome.ok
          ? { status: 'ready', diagram: outcome.diagram }
          : { status: 'failed', message: outcome.message },
      });
    });

    return () => {
      active = false;
    };
  }, [code, theme, key]);

  // A diagram for another source is not this one's: that is what loading means
  // here, and it is derived rather than written into state by the effect.
  return rendered !== null && rendered.key === key ? rendered.state : { status: 'loading' };
}
