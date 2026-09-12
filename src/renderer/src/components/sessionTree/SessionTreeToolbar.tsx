import React from 'react';
import { IconSearch } from '@tabler/icons-react';
import { cn } from '../../lib/utils';
import type { SessionTreeKind } from '../../lib/sessionTreeData';
import { SessionTreeHelpButton } from './SessionTreeHelpDialog';

/** Kind filter chips; a chip toggles every kind in its group. */
const KIND_FILTER_CHIPS: { label: string; kinds: SessionTreeKind[] }[] = [
  { label: 'User', kinds: ['user'] },
  { label: 'Assistant', kinds: ['assistant'] },
  { label: 'Tools', kinds: ['toolResult'] },
  { label: 'Summaries', kinds: ['compaction', 'branchSummary'] },
];

interface SessionTreeToolbarProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  kinds: ReadonlySet<SessionTreeKind>;
  onKindsChange: (kinds: ReadonlySet<SessionTreeKind>) => void;
  /** Rows left after the search and the filters. */
  itemCount: number;
  /** Rows in the session, filters aside. */
  totalCount: number;
  treeCount: number;
}

/** Search, the row count and the kind filters. */
export function SessionTreeToolbar({
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  kinds,
  onKindsChange,
  itemCount,
  totalCount,
  treeCount,
}: SessionTreeToolbarProps): React.JSX.Element {
  const isFiltered = query.trim() !== '' || kinds.size > 0;
  const counts = isFiltered
    ? `${itemCount} of ${totalCount} messages`
    : treeCount > 1
      ? `${treeCount} trees · ${totalCount} messages`
      : `${totalCount} ${totalCount === 1 ? 'message' : 'messages'}`;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-3">
        <IconSearch size={18} className="shrink-0 text-muted-foreground/60" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search this session"
          className="min-w-0 flex-1 bg-transparent pr-6 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground/55"
        />
        <span className="shrink-0 text-xs text-muted-foreground/80">{counts}</span>
        <SessionTreeHelpButton className="ml-3" />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-5 pb-3">
        {KIND_FILTER_CHIPS.map((chip) => {
          const active = chip.kinds.every((kind) => kinds.has(kind));
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={active}
              data-tree-filter={chip.label.toLowerCase()}
              data-active={active ? 'true' : undefined}
              onClick={() => onKindsChange(toggleKinds(kinds, chip.kinds))}
              className={cn(
                'rounded-md border px-2.5 py-0.5 text-xs transition-colors',
                active
                  ? 'border-transparent bg-[var(--system-accent)]/12 text-[var(--system-accent)]'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Toggle every kind in a chip, keeping the set empty when nothing is left. */
function toggleKinds(
  current: ReadonlySet<SessionTreeKind>,
  chipKinds: SessionTreeKind[],
): ReadonlySet<SessionTreeKind> {
  const next = new Set(current);
  const active = chipKinds.every((kind) => next.has(kind));
  for (const kind of chipKinds) {
    if (active) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
  }
  return next;
}
