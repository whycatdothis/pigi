import { useEffect, useRef } from 'react';
import type { PathCompletionEntry } from '../../../../shared/ipcContract';
import { cn } from '../../lib/utils';
import { FileIcon } from '../fileIcon';
import { IconFolder } from '@tabler/icons-react';

interface PathMentionPopoverProps {
  /** Empty while a directory read is in flight. */
  entries: PathCompletionEntry[];
  /** Set when the directory listing failed. */
  error: string | null;
  selectedIndex: number;
  onSelect: (entry: PathCompletionEntry) => void;
  onHover: (index: number) => void;
}

/** Directory entries for the path token being typed. */
export function PathMentionPopover({
  entries,
  error,
  selectedIndex,
  onSelect,
  onHover,
}: PathMentionPopoverProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);

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
      className="absolute bottom-full left-0 z-30 mb-2 w-max max-w-full overflow-hidden rounded-lg bg-popover/50 shadow-md ring-[0.5px] ring-foreground/25 backdrop-blur-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div ref={listRef} className="max-h-[25vh] overflow-y-auto p-1">
        {entries.length === 0 ? (
          <div className="px-2 py-1 text-[0.875rem] text-muted-foreground">
            {error ?? 'Loading…'}
          </div>
        ) : (
          entries.map((entry, index) => (
            <button
              key={entry.path}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[0.875rem]',
                index === selectedIndex && 'bg-foreground/7',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(entry);
              }}
              onMouseEnter={() => onHover(index)}
            >
              {entry.isDirectory ? (
                <IconFolder className="size-4 shrink-0" />
              ) : (
                <FileIcon path={entry.path} />
              )}
              <span className="min-w-0 truncate text-foreground">
                {entry.name}
                {entry.isDirectory && '/'}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
