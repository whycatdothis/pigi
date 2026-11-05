import { memo, useLayoutEffect, useState } from 'react';
import Zoom from 'react-medium-image-zoom';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import CodeCopyButton from './codeCopyButton';
import { ensureDiagramStyles } from '../../lib/mermaidRenderer';
import { useMermaidDiagram } from '../../hooks/useMermaidDiagram';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../state/settingsStore';
import { ZOOM_MARGIN_PX, ZoomPanContent } from '../zoomableImage';

/**
 * Memoised on purpose: React writes `dangerouslySetInnerHTML` back into the DOM
 * whenever the element renders, identical string or not, which would tear down
 * and rebuild the drawing underneath the reader. Whatever the drawing is holding
 * on to — the zoom overlay's own element, a text selection, the browser's layout
 * for it — would be lost with it.
 */
const DiagramGraphic = memo(function DiagramGraphic({
  markup,
}: {
  markup: string;
}): React.JSX.Element {
  return (
    <div
      className="mermaid-diagram-graphic"
      data-testid="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});

/**
 * A mermaid code block, drawn.
 *
 * The source stays reachable — it is what the reader edits and what a diagram the
 * model got wrong has to fall back to — so the header carries a switch between
 * the two. Until a diagram is drawn (a first render measures text, which takes a
 * frame or two) the source is what shows, and if it cannot be drawn at all it
 * stays, with a line saying so.
 */
export default function MermaidDiagram({ code }: { code: string }): React.JSX.Element {
  const theme = useSettingsStore((state) => state.appearance.diagramTheme);
  // Diagrams are measured with the app's own font, so the drawing has to be made
  // again when that changes. Subscribe to the primitives that feed the font key
  // rather than building the key inside the selector: a selector that allocates
  // runs its own comparison on every store change, once per mounted diagram.
  const [mode, separateModes, lightFamily, lightSize, darkFamily, darkSize] = useSettingsStore(
    useShallow((state) => {
      const { appearance } = state;
      const light = appearance.light.fonts;
      const dark = appearance.dark.fonts;
      return [
        appearance.mode,
        appearance.separateModes,
        light.ui,
        light.uiSize,
        dark.ui,
        dark.uiSize,
      ];
    }),
  );
  const fontKey = [mode, separateModes, lightFamily, lightSize, darkFamily, darkSize].join('|');
  const diagram = useMermaidDiagram(code, theme, fontKey);
  const [showingSource, setShowingSource] = useState(false);
  const showDiagram = diagram.status === 'ready' && !showingSource;
  const styles = diagram.status === 'ready' ? diagram.diagram.styles : null;
  const styleScope = diagram.status === 'ready' ? diagram.diagram.styleScope : null;

  // The drawing is styled by rules that live outside it, so they go in with the
  // commit rather than after it: a paint without them would be a black diagram.
  useLayoutEffect(() => {
    if (styles !== null && styleScope !== null) {
      ensureDiagramStyles(styles, styleScope);
    }
  }, [styles, styleScope]);

  return (
    <div className="markdown-code-block" data-testid="mermaid-block">
      <div className="markdown-code-header" data-search-ignore>
        <span className="markdown-code-label">Mermaid</span>
        <div className="markdown-code-actions">
          <button
            type="button"
            className="markdown-code-source-toggle"
            data-testid="mermaid-source-toggle"
            title={showingSource ? 'Show the diagram' : 'Show the source'}
            aria-pressed={showingSource}
            onClick={() => {
              setShowingSource((current) => !current);
            }}
          >
            {showingSource ? 'Diagram' : 'Source'}
          </button>
          <CodeCopyButton code={code} />
        </div>
      </div>

      {showDiagram && diagram.status === 'ready' ? (
        <div className="mermaid-diagram-body">
          {/* The overlay looks the drawing up once, when it mounts, and keeps the
              element it found: a theme switch is what replaces the drawing, so it
              is what mounts a new overlay. */}
          <Zoom key={theme} zoomMargin={ZOOM_MARGIN_PX} ZoomContent={ZoomPanContent}>
            <DiagramGraphic markup={diagram.diagram.svg} />
          </Zoom>
        </div>
      ) : (
        <pre data-testid="mermaid-source">
          <SyntaxHighlightedCode code={code} language="mermaid" />
        </pre>
      )}

      {diagram.status === 'failed' && (
        <p className="mermaid-diagram-error" data-testid="mermaid-diagram-error" data-search-ignore>
          This diagram could not be drawn{diagram.message === '' ? '.' : `: ${diagram.message}`}
        </p>
      )}
    </div>
  );
}
