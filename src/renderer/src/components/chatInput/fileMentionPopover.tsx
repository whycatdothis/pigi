import { useEffect, useRef } from 'react';
import { IconFile } from '@tabler/icons-react';
import { cn } from '../../lib/utils';

interface FileMentionPopoverProps {
  matches: string[];
  selectedIndex: number;
  loading: boolean;
  onSelect: (path: string) => void;
  onHover: (index: number) => void;
}

/** Inline file references for the `@` trigger. */
export function FileMentionPopover({
  matches,
  selectedIndex,
  loading,
  onSelect,
  onHover,
}: FileMentionPopoverProps): React.JSX.Element {
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

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border bg-popover shadow-lg"
      onMouseDown={(event) => event.preventDefault()}
    >
      {matches.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {loading ? 'Loading files…' : 'No files found'}
        </div>
      ) : (
        <div ref={listRef} className="max-h-[40vh] overflow-y-auto p-1">
          {matches.map((path, index) => (
            <button
              key={path}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm',
                index === selectedIndex && 'bg-foreground/7',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(path);
              }}
              onMouseEnter={() => onHover(index)}
            >
              <IconFile className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">{path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
