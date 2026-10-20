import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    if (selectedIndex === 0) {
      container.scrollTop = 0;
      return;
    }
    container.querySelectorAll('button')[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, matches]);

  // Nothing to show until the first search finishes; an empty box or a
  // "searching" placeholder over the transcript reads as flicker.
  if (searching && matches.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-lg bg-popover/50 shadow-md ring-[0.5px] ring-foreground/25 backdrop-blur-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      {matches.length === 0 ? (
        <div className="p-1">
          <div className="px-2 py-1 text-[0.875rem] text-muted-foreground">
            {error ? `File search unavailable: ${error}` : 'No files found'}
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
