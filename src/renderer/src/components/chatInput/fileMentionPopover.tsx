import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { FileIcon } from '../fileIcon';

interface FileMentionPopoverProps {
  matches: string[];
  selectedIndex: number;
  searching: boolean;
  /** Set when the last search failed; an unavailable index is not an empty project. */
  error: string | null;
  onSelect: (path: string) => void;
  onHover: (index: number) => void;
}

/** Inline file references for the `@` trigger. */
export function FileMentionPopover({
  matches,
  selectedIndex,
  searching,
  error,
  onSelect,
  onHover,
}: FileMentionPopoverProps): React.JSX.Element | null {
  const listRef = useRef<HTMLDivElement>(null);
  const [showSearchingHint, setShowSearchingHint] = useState(false);

  useEffect(() => {
    if (!searching) {
      // Clear on the next task; setting state synchronously in an effect
      // triggers a cascading render lint error.
      const reset = window.setTimeout(() => setShowSearchingHint(false), 0);
      return () => window.clearTimeout(reset);
    }
    // Brief searches finish under this delay; only a cold index shows the hint.
    const timer = window.setTimeout(() => setShowSearchingHint(true), 250);
    return () => window.clearTimeout(timer);
  }, [searching]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    if (selectedIndex === 0) {
      container.scrollTop = 0;
      return;
    }
    container.querySelectorAll('button')[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, matches]);

  // Keep the popover hidden for fast searches; a cold index gets a hint after
  // a short delay instead of looking like nothing happened.
  if (searching && matches.length === 0 && !showSearchingHint) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-lg bg-popover/50 shadow-md ring-[0.5px] ring-foreground/25 backdrop-blur-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      {matches.length === 0 ? (
        <div className="p-1">
          <div className="px-2 py-1 text-[0.875rem] text-muted-foreground">
            {searching
              ? 'Searching files…'
              : error
                ? `File search unavailable: ${error}`
                : 'No files found'}
          </div>
        </div>
      ) : (
        <div ref={listRef} className="max-h-[25vh] overflow-y-auto p-1">
          {matches.map((path, index) => (
            <button
              key={path}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[0.875rem]',
                index === selectedIndex && 'bg-foreground/7',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(path);
              }}
              onMouseEnter={() => onHover(index)}
            >
              <FileIcon path={path} />
              <span className="truncate text-foreground">{path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
