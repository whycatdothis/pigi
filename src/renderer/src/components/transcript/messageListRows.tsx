import React, { useRef } from 'react';
import type { RenderItem } from '../../lib/readGrouping';
import {
  type TranscriptNode,
  type ToolNode,
  type AssistantNode,
} from '../../state/transcriptController';
import { MESSAGE_CONTENT_MAX_WIDTH } from '../../lib/layoutConstants';
import ToolBlock from '../message/ToolBlock';
import MarkdownMessage from '../message/markdownMessage';
import { useHighlightTextNodes } from '../../lib/highlightMatches';
import ThinkingBlock from '../message/thinkingBlock';
import {
  AssistantError,
  MessageToolbar,
  UserBubble,
  SystemBubble,
} from '../message/messageBubbles';
import CollapsedReadGroup from '../message/CollapsedReadGroup';

// Memoized so that virtualizer-driven re-renders (e.g. while the bottom terminal
// panel animates open/close and the scroll container resizes every frame) skip
// re-rendering rows whose props are unchanged, instead of reconciling every
// visible markdown/tool tree on each frame.
export const RenderItemRenderer = React.memo(function RenderItemRenderer({
  item,
  isLast,
  showActions,
  runEndedAt,
  runDurationMs,
  sessionActive,
  searchQuery,
  expanded,
  onToggleExpand,
  activeOccurrenceItemId,
  activeOccurrenceToolNodeId,
  activeOccurrenceIndex,
}: {
  item: RenderItem;
  isLast: boolean;
  /** Reply actions belong to the last row of a reply, not to every row. */
  showActions: boolean;
  runEndedAt?: number;
  runDurationMs?: number;
  sessionActive: boolean;
  searchQuery: string;
  expanded?: boolean;
  /** Stable group-toggle callback (takes the group id) so React.memo comparisons hold. */
  onToggleExpand?: (groupId: string) => void;
  activeOccurrenceItemId: string | null;
  activeOccurrenceToolNodeId: string | null;
  activeOccurrenceIndex: number | null;
}): React.JSX.Element {
  const activeIndex = item.id === activeOccurrenceItemId ? activeOccurrenceIndex : null;
  const activeToolNodeId = item.id === activeOccurrenceItemId ? activeOccurrenceToolNodeId : null;
  if (item.type === 'readGroup') {
    return (
      <CollapsedReadGroup
        entries={item.entries}
        isActive={isLast && sessionActive}
        open={expanded ?? false}
        onOpenChange={onToggleExpand ? () => onToggleExpand(item.id) : () => {}}
        searchQuery={searchQuery}
        activeToolNodeId={activeToolNodeId}
        activeOccurrenceIndex={activeIndex}
      />
    );
  }
  return (
    <NodeRenderer
      node={item.node}
      showActions={showActions}
      runEndedAt={runEndedAt}
      runDurationMs={runDurationMs}
      searchQuery={searchQuery}
      activeOccurrenceIndex={activeIndex}
    />
  );
});

function NodeRenderer({
  node,
  showActions,
  runEndedAt,
  runDurationMs,
  searchQuery,
  activeOccurrenceIndex,
}: {
  node: TranscriptNode;
  showActions: boolean;
  runEndedAt?: number;
  runDurationMs?: number;
  searchQuery: string;
  activeOccurrenceIndex: number | null;
}): React.JSX.Element {
  switch (node.role) {
    case 'user':
      return (
        <UserBubble
          node={node}
          searchQuery={searchQuery}
          activeOccurrenceIndex={activeOccurrenceIndex}
        />
      );
    case 'assistant':
      return (
        <AssistantBubble
          node={node}
          showActions={showActions}
          runEndedAt={runEndedAt}
          runDurationMs={runDurationMs}
          searchQuery={searchQuery}
          activeOccurrenceIndex={activeOccurrenceIndex}
        />
      );
    case 'tool':
      return (
        <ToolBubble
          node={node}
          showActions={showActions}
          runEndedAt={runEndedAt}
          runDurationMs={runDurationMs}
          searchQuery={searchQuery}
          activeOccurrenceIndex={activeOccurrenceIndex}
        />
      );
    case 'system':
      return (
        <SystemBubble
          node={node}
          searchQuery={searchQuery}
          activeOccurrenceIndex={activeOccurrenceIndex}
        />
      );
  }
}

function ToolBubble({
  node,
  showActions,
  runEndedAt,
  runDurationMs,
  searchQuery,
  activeOccurrenceIndex,
}: {
  node: ToolNode;
  showActions: boolean;
  runEndedAt?: number;
  runDurationMs?: number;
  searchQuery: string;
  activeOccurrenceIndex: number | null;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  useHighlightTextNodes(containerRef, searchQuery, activeOccurrenceIndex);

  return (
    <div ref={containerRef} className="group">
      <ToolBlock node={node} />
      {showActions && (
        <MessageToolbar node={node} runEndedAt={runEndedAt} runDurationMs={runDurationMs} />
      )}
    </div>
  );
}

function AssistantBubble({
  node,
  showActions,
  runEndedAt,
  runDurationMs,
  searchQuery,
  activeOccurrenceIndex,
}: {
  node: AssistantNode;
  showActions: boolean;
  runEndedAt?: number;
  runDurationMs?: number;
  searchQuery: string;
  activeOccurrenceIndex: number | null;
}): React.JSX.Element {
  const showThinking = node.thinking.length > 0;
  const showText = node.text.length > 0;
  const contentRef = useRef<HTMLDivElement>(null);

  useHighlightTextNodes(contentRef, searchQuery, activeOccurrenceIndex);

  return (
    <div className="group flex justify-start" data-testid="assistant-message">
      <div
        ref={contentRef}
        className="w-full min-w-0 text-body text-foreground"
        style={{ maxWidth: `${MESSAGE_CONTENT_MAX_WIDTH}px` }}
      >
        {showThinking && (
          <ThinkingBlock
            text={node.thinking}
            startedAt={node.thinkingStartedAt}
            endedAt={node.thinkingEndedAt}
            isStreaming={node.isStreaming}
          />
        )}

        {showText && (
          <div
            style={{
              marginTop: showThinking ? 'var(--message-kind-change-spacing)' : undefined,
            }}
          >
            <MarkdownMessage text={node.text} isStreaming={node.isStreaming} />
          </div>
        )}

        {node.errorMessage && <AssistantError message={node.errorMessage} />}

        {showActions && (
          <MessageToolbar node={node} runEndedAt={runEndedAt} runDurationMs={runDurationMs} />
        )}
      </div>
    </div>
  );
}
