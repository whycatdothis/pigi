import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import FindPopover from '../ui/findPopover';

export interface MessageSearchTarget {
  renderIndex: number;
  itemId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  groupId?: string;
  toolNodeId?: string;
  text: string;
  meta: string;
  preview: string;
}

export interface OccurrenceResult {
  target: MessageSearchTarget;
  occurrenceIndex: number;
}

interface MessageSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: MessageSearchTarget[];
  onJump: (result: OccurrenceResult) => void;
  query: string;
  onQueryChange: (query: string) => void;
  refocus: number;
}

function isInsideMessageList(target: Element): boolean {
  return target.closest('[data-testid="message-list"]') !== null;
}

export default function MessageSearch({
  open,
  onOpenChange,
  targets,
  onJump,
  query,
  onQueryChange,
  refocus,
}: MessageSearchProps): React.JSX.Element | null {
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    const trimmed = deferredQuery.trim().toLowerCase();
    if (!trimmed) return [] as OccurrenceResult[];
    const results: OccurrenceResult[] = [];
    const targetCounts = new Map<MessageSearchTarget, number>();
    const lowerTrimmed = trimmed;
    for (const target of targets) {
      // Count matches in DOM tree order: meta (tool label / thinking block) appears
      // before text (output / markdown) in the rendered DOM.
      for (const source of [target.meta, target.text]) {
        const lowerSource = source.toLowerCase();
        let searchIndex = 0;
        while (searchIndex < lowerSource.length) {
          const matchIndex = lowerSource.indexOf(lowerTrimmed, searchIndex);
          if (matchIndex === -1) break;
          const count = targetCounts.get(target) ?? 0;
          targetCounts.set(target, count + 1);
          results.push({ target, occurrenceIndex: count });
          searchIndex = matchIndex + lowerTrimmed.length;
        }
      }
    }
    return results;
  }, [deferredQuery, targets]);

  const totalMatches = results.length;
  const clampedIndex = activeIndex >= totalMatches ? Math.max(0, totalMatches - 1) : activeIndex;

  const jumpTo = useCallback(
    (index: number): void => {
      if (results.length === 0) return;
      const clamped = ((index % results.length) + results.length) % results.length;
      setActiveIndex(clamped);
      onJump(results[clamped]);
    },
    [results, onJump],
  );

  // Auto-jump to first match when query changes
  const prevDeferredRef = useRef(deferredQuery);
  useEffect(() => {
    const prev = prevDeferredRef.current;
    prevDeferredRef.current = deferredQuery;
    if (prev === deferredQuery) return;
    if (deferredQuery.trim().length > 0 && results.length > 0) {
      onJump(results[0]);
    }
  }, [deferredQuery, results, onJump]);

  return (
    <FindPopover
      open={open}
      onOpenChange={onOpenChange}
      query={query}
      onQueryChange={(next) => {
        setActiveIndex(0);
        onQueryChange(next);
      }}
      matchCount={deferredQuery.trim().length > 0 ? totalMatches : null}
      activeIndex={clampedIndex}
      onStep={(direction) => jumpTo(clampedIndex + direction)}
      focusRequest={refocus}
      placeholder="Search messages…"
      keepOpenOnInteract={isInsideMessageList}
    />
  );
}
