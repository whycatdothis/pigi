import { memo, useLayoutEffect, useRef, useState } from 'react';
import Zoom from 'react-medium-image-zoom';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
// The overlay's own styles, which the image preview brings in for itself: a
// diagram is zoomable whether or not an image happens to be on screen.
import 'react-medium-image-zoom/dist/styles.css';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import CodeCopyButton from './codeCopyButton';
import { ensureDiagramStyles } from '../../lib/mermaidRenderer';
import { useMermaidDiagram } from '../../hooks/useMermaidDiagram';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

/** Breathing room around a zoomed diagram, so it reads as floating over the window. */
const ZOOM_MARGIN_PX = 24;
/** How far a pointer may travel and still count as a click rather than a drag. */
const DRAG_SLOP_PX = 4;
/** How far into a drawing the overlay may be zoomed. */
const MAX_ZOOM_SCALE = 8;

/**
 * What the overlay holds: the drawing, with panning and zooming of its own.
 *
 * Two gestures belong to the overlay rather than to the drawing — the wheel and
 * the touch move that dismiss it — and they are only the reader's when they are
 * not the middle of a gesture of this content's. A wheel that pans or zooms the
 * drawing stays here, and a drag that happens to end on the drawing is the end
 * of a gesture rather than the click that dismisses the overlay.
 */
function DiagramZoomContent({
  img,
  buttonUnzoom,
  modalState,
  onUnzoom,
}: {
  img: React.ReactElement | null;
  buttonUnzoom: React.ReactElement<HTMLButtonElement>;
  modalState: string;
  onUnzoom: (e: Event) => void;
}): React.JSX.Element {
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // Every visit starts at the drawing as it was fitted to the window, rather
  // than wherever the last one was left.
  useLayoutEffect(() => {
    if (modalState === 'LOADING') {
      transformRef.current?.resetTransform(0);
    }
  }, [modalState]);

  return (
    <>
      <div
        className="mermaid-zoom-surface"
        onPointerDownCapture={(event) => {
          pressedAt.current = { x: event.clientX, y: event.clientY };
          dragged.current = false;
        }}
        onPointerMoveCapture={(event) => {
          const start = pressedAt.current;
          if (start === null || dragged.current) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_SLOP_PX) {
            dragged.current = true;
          }
        }}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          dragged.current = false;
          event.stopPropagation();
        }}
        onClick={(event) => {
          // A click on the space around the drawing dismisses the overlay, which
          // is what it does about a click on its own background: this surface is
          // the element that covers it.
          const target = event.target;
          if (target instanceof Element && target.closest('[data-rmiz-modal-img]') !== null) {
            return;
          }
          onUnzoom(event.nativeEvent);
        }}
        onWheel={(event) => {
          event.stopPropagation();
        }}
        onTouchMove={(event) => {
          event.stopPropagation();
        }}
      >
        <TransformWrapper
          ref={transformRef}
          maxScale={MAX_ZOOM_SCALE}
          panning={{ allowLeftClickPan: true }}
          trackPadPanning={{ disabled: false }}
          doubleClick={{ disabled: true }}
          keyboard={{ disabled: false }}
        >
          {/* The drawing is positioned inside this box by the overlay itself, so
              the box is what the drawing is panned and zoomed within. */}
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{ width: '100%', height: '100%' }}
          >
            {img}
          </TransformComponent>
        </TransformWrapper>
      </div>
      {buttonUnzoom}
    </>
  );
}

/**
 * The drawing itself, as markup.
 *
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
  const theme = useResolvedTheme();
  const diagram = useMermaidDiagram(code, theme);
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
          <Zoom key={theme} zoomMargin={ZOOM_MARGIN_PX} ZoomContent={DiagramZoomContent}>
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
