import React from 'react';
import { RAIL_WIDTH_PX, railColor } from './sessionTreeGeometry';
import { railLeftPx, type SessionTreeRailSpan } from './sessionTreeListModel';

interface SessionTreeRailsProps {
  spans: readonly SessionTreeRailSpan[];
  /** Content y of the rendered window's top; the spans are drawn against it. */
  windowTopPx: number;
}

/**
 * The branch lines of the whole list, in one layer.
 *
 * A line belongs to a fork, not to a row: it runs from just above the fork's
 * first child down to its last child's elbow. Drawing them here — rather than in
 * a wrapper around each branch's subtree — is what lets the rows be a flat,
 * windowed list: a row that is not rendered still has its line, because the line
 * never belonged to it.
 *
 * The layer is inert: it must not take the pointer away from the rows below it,
 * so a click in the gutter lands on the row, as it should.
 */
export function SessionTreeRails({
  spans,
  windowTopPx,
}: SessionTreeRailsProps): React.JSX.Element | null {
  if (spans.length === 0) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      data-testid="session-tree-rails"
    >
      {spans.map((span) => {
        const top = span.topPx - windowTopPx;
        const end = span.endPx - windowTopPx;
        const litEnd = span.litEndPx === null ? null : span.litEndPx - windowTopPx;
        const litHeight = litEnd === null ? end - top : litEnd - top;
        return (
          <React.Fragment key={span.firstChildItemId}>
            {/*
              Two pieces, never overlapping: the lines are translucent, so
              painting the lit run over the quiet one would deepen it.
            */}
            <span
              data-tree-rail-fork-depth={span.forkDepth}
              data-tree-rail-lit={litEnd === null ? 'false' : 'true'}
              className="absolute"
              style={{
                left: railLeftPx(span.forkDepth),
                top,
                width: RAIL_WIDTH_PX,
                height: litHeight,
                background: railColor(litEnd !== null),
              }}
            />
            {litEnd !== null && litEnd < end && (
              <span
                data-tree-rail-fork-depth={span.forkDepth}
                data-tree-rail-lit="false"
                className="absolute"
                style={{
                  left: railLeftPx(span.forkDepth),
                  top: litEnd,
                  width: RAIL_WIDTH_PX,
                  height: end - litEnd,
                  background: railColor(false),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
