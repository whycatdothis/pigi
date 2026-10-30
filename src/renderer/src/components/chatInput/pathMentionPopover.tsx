import { useEffect, useLayoutEffect, useRef } from 'react';
import type { PathCompletionEntry } from '../../../../shared/ipcContract';
import { pathCompletionLabel } from '../../lib/pathReferences';
import { cn } from '../../lib/utils';
import { FileIcon } from '../fileIcon';

interface PathMentionPopoverProps {
  /** Empty while a directory read is in flight. */
  entries: PathCompletionEntry[];
  /** Token being completed, including its directory prefix. */
  token: string;
  /** Full path label of a preceding folder chip, if any. */
  baseLabel: string | null;
  /** Set when the directory listing failed. */
  error: string | null;
  selectedIndex: number;
  onSelect: (entry: PathCompletionEntry) => void;
  onHover: (index: number) => void;
  /** Viewport rect of the token being completed. */
  anchorRect: () => DOMRect | null;
}

/** Directory entries for the path token being typed. */
export function PathMentionPopover({
  entries,
  token,
  baseLabel,
  error,
  selectedIndex,
  onSelect,
  onHover,
  anchorRect,
}: PathMentionPopoverProps): React.JSX.Element {
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sit above the token's line, starting at the token, like editor completion
  // (`mb-2` is the gap). Without an anchor it stays at the composer's top-left.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const container = popover?.offsetParent;
    const anchor = anchorRect();
    if (!popover || !(container instanceof HTMLElement) || !anchor) return;
    const containerRect = container.getBoundingClientRect();
    const maxLeft = Math.max(0, containerRect.width - popover.offsetWidth);
    const left = Math.min(Math.max(0, anchor.left - containerRect.left), maxLeft);
    popover.style.left = `${left}px`;
    popover.style.bottom = `${containerRect.bottom - anchor.top}px`;
  }, [anchorRect, entries, token, baseLabel, error]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    if (selectedIndex === 0) {
      container.scrollTop = 0;
      return;
    }
    container.querySelectorAll('button')[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, entries]);

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 z-30 mb-2 w-max max-w-full overflow-hidden rounded-surface bg-popover/50 shadow-md ring-[0.5px] ring-foreground/25 backdrop-blur-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div ref={listRef} className="max-h-[25vh] overflow-y-auto p-1">
        {entries.length === 0 ? (
          <div className="px-2 py-1 text-ui text-muted-foreground">{error ?? 'Loading…'}</div>
        ) : (
          entries.map((entry, index) => (
            <button
              key={entry.path}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-control px-2 py-1 text-left text-ui text-foreground',
                index === selectedIndex && 'bg-accent-subtle text-[var(--system-accent)]',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(entry);
              }}
              onMouseEnter={() => onHover(index)}
            >
              {entry.isDirectory ? null : <FileIcon path={entry.path} />}
              <span className="min-w-0 truncate">
                {pathCompletionLabel(token, baseLabel, entry.name)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
