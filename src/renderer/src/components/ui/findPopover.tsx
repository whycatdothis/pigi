import { useEffect, useRef } from 'react';
import { IconArrowUp, IconArrowDown, IconX, IconSearch } from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverAnchor } from './popover';
import { Input } from './input';

/**
 * The find bar's look and keys, anchored to the top right of the nearest
 * positioned ancestor. Matching is the caller's: transcript search matches a
 * model of virtualized rows, container find matches the rendered DOM.
 */
export default function FindPopover({
  open,
  onOpenChange,
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onStep,
  focusRequest,
  placeholder,
  keepOpenOnInteract,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Null while there is nothing to search for. */
  matchCount: number | null;
  activeIndex: number;
  onStep: (direction: 1 | -1) => void;
  /** Bumped by Cmd+F; each change focuses the input and selects the query. */
  focusRequest: number;
  placeholder: string;
  /** Clicks here (the searched content) leave the bar open. */
  keepOpenOnInteract: (target: Element) => boolean;
}): React.JSX.Element | null {
  const inputRef = useRef<HTMLInputElement>(null);

  // The focus request the input last answered; null before its first showing.
  const answeredRequestRef = useRef<number | null>(null);

  // A repeated Cmd+F while the bar is up. A first showing has no input yet
  // here; Radix's open auto-focus handles it below.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    answeredRequestRef.current = focusRequest;
    input.focus();
    input.select();
  }, [focusRequest]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (!matchCount) return;
    if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      onStep((event.key === 'Enter' && event.shiftKey) || event.key === 'ArrowUp' ? -1 : 1);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor className="absolute right-5 top-2" />
      <PopoverContent
        align="end"
        sideOffset={0}
        className="w-72 rounded-surface p-0"
        onOpenAutoFocus={(event) => {
          // Shown again with its tab rather than asked for: the composer keeps focus.
          if (answeredRequestRef.current === focusRequest) event.preventDefault();
          answeredRequestRef.current = focusRequest;
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (target instanceof Element && keepOpenOnInteract(target)) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex items-center gap-1.5 px-2 py-1">
          <IconSearch className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-7 w-44 border-0 bg-transparent px-px text-body shadow-none focus-visible:ring-0"
          />
          <div className="ml-auto flex items-center gap-1.5">
            {matchCount !== null && matchCount > 0 && (
              <>
                <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                  {activeIndex + 1}/{matchCount}
                </span>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onStep(-1)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    title="Previous match (Shift+Enter)"
                  >
                    <IconArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStep(1)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    title="Next match (Enter)"
                  >
                    <IconArrowDown className="size-4" />
                  </button>
                </span>
              </>
            )}
            {matchCount === 0 && (
              <span className="shrink-0 text-2xs whitespace-nowrap text-danger-fg">NOT FOUND</span>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="Close (Esc)"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
