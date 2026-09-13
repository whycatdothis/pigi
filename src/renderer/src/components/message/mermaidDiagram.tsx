import { useMemo, useState } from 'react';
import Zoom from 'react-medium-image-zoom';
// The overlay's own styles, which the image preview brings in for itself: a
// diagram is zoomable whether or not an image happens to be on screen.
import 'react-medium-image-zoom/dist/styles.css';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import CodeCopyButton from './codeCopyButton';
import { useMermaidDiagram } from '../../hooks/useMermaidDiagram';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

/** Breathing room around a zoomed diagram, so it reads as floating over the window. */
const ZOOM_MARGIN_PX = 24;

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
  const theme = useResolvedTheme();
  const diagram = useMermaidDiagram(code, theme);
  const [showingSource, setShowingSource] = useState(false);
  const showDiagram = diagram.status === 'ready' && !showingSource;
  const svg = diagram.status === 'ready' ? diagram.diagram.svg : '';

  // The drawing goes in as an image rather than as markup: an `<img>` renders an
  // SVG with its scripts and its links inert, which is what the text of a diagram
  // written by a model deserves. It also gives the zoom overlay the element it is
  // built around, and keeps mermaid's ids out of this document.
  const source = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    [svg],
  );

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
        <div className="mermaid-diagram-body" data-search-ignore>
          <Zoom zoomMargin={ZOOM_MARGIN_PX}>
            <img
              className="mermaid-diagram-graphic"
              data-testid="mermaid-diagram"
              src={source}
              alt="Mermaid diagram"
              width={diagram.diagram.width}
              height={diagram.diagram.height}
            />
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
