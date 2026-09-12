import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconBinaryTree, IconChevronRight, IconSearch, IconUser } from '@tabler/icons-react';
import { hotkeysCoreFeature, syncDataLoaderFeature } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import type { ItemInstance, TreeInstance } from '@headless-tree/core';
import type {
  EntryTextResult,
  SessionTreeDto,
  SessionTreeEntryDto,
} from '../../../shared/ipcContract';
import { getEntryText, getSessionTree } from '../services/piAgentClient';
import {
  createSessionTreeData,
  describeSessionTreeEntry,
  formatSessionTreeTime,
  SESSION_TREE_ROOT_ID,
  type SessionTreeData,
  type SessionTreeItem,
  type SessionTreeKind,
  type SessionTreeRootStats,
} from '../lib/sessionTreeData';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { SessionTreeHelpButton } from './SessionTreeHelpDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

/** Indent column width. Guide lines sit in the middle of a column. */
const INDENT_PX = 16;
const ROW_HEIGHT_PX = 32;
const CARD_WIDTH_PX = 380;
const CARD_MAX_HEIGHT_PX = 320;
const HIDE_DELAY_MS = 140;

/** Kind filter chips; a chip toggles every kind in its group. */
const KIND_FILTER_CHIPS: { label: string; kinds: SessionTreeKind[] }[] = [
  { label: 'User', kinds: ['user'] },
  { label: 'Assistant', kinds: ['assistant'] },
  { label: 'Tools', kinds: ['toolResult'] },
  { label: 'Summaries', kinds: ['compaction', 'branchSummary'] },
];
const TEXT_FETCH_DELAY_MS = 100;

interface CardState {
  entryId: string;
  /** Anchored below the row when there is room, otherwise above it. */
  top?: number;
  bottom?: number;
}

interface SessionTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionPath: string;
  /** Changes while the dialog is open and the session grows. */
  revision: string;
  /** The id of the entry the user picked; the caller re-reads the tree and
   *  decides about summarizing. */
  onSelect: (entryId: string) => void;
}

/**
 * The whole session, not just the active branch.
 *
 * Tree state — flattening, expansion, keyboard navigation, ARIA — comes from
 * headless-tree (`@headless-tree/core`); the rows, guide lines, search and the
 * hover preview are ours.
 */
export default function SessionTreeDialog({
  open,
  onOpenChange,
  sessionPath,
  revision,
  onSelect,
}: SessionTreeDialogProps): React.JSX.Element {
  // The loaded tree is stored together with the session it came from: while a
  // switch is in flight the dialog keeps showing "Loading…" instead of the
  // previous session's tree. `generation` counts reads, and the list is keyed by
  // it: a fresh read is a fresh list, so a row that just landed in the session
  // is on screen without any cache to invalidate.
  const [loaded, setLoaded] = useState<{
    path: string;
    tree: SessionTreeDto;
    generation: number;
  } | null>(null);
  const generationRef = useRef(0);
  /** The first dataset of a visit scrolls to the current row; a refresh must not. */
  const firstFetchOfVisitRef = useRef(true);
  const [scrollGeneration, setScrollGeneration] = useState(0);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<ReadonlySet<SessionTreeKind>>(() => new Set());
  const [card, setCard] = useState<CardState | null>(null);
  const [previewText, setPreviewText] = useState<EntryTextResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<TreeInstance<SessionTreeItem> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textCacheRef = useRef(new Map<string, EntryTextResult>());
  const hoveredEntryIdRef = useRef<string | null>(null);

  const currentTree = loaded?.path === sessionPath ? loaded.tree : null;
  const data = useMemo(
    () => (currentTree ? createSessionTreeData(currentTree, { query, kinds }) : null),
    [currentTree, query, kinds],
  );
  const trimmedQuery = query.trim();
  const totalCount = currentTree?.entries.length ?? 0;
  const treeCount = data?.rootIds.length ?? 0;
  const isFiltered = trimmedQuery !== '' || kinds.size > 0;

  // Read the tree on open and again whenever the session grows while the dialog
  // is up: entries land as messages finish, so a tree opened mid-turn fills in
  // by itself instead of needing a reopen.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getSessionTree(sessionPath);
        if (cancelled) return;
        generationRef.current += 1;
        setLoaded({ path: sessionPath, tree: result, generation: generationRef.current });
        if (firstFetchOfVisitRef.current) {
          firstFetchOfVisitRef.current = false;
          setScrollGeneration(generationRef.current);
        }
      } catch (error) {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : 'Failed to read the session tree');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionPath, revision]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
    },
    [],
  );

  /** Drop the card and any pending preview read (a row with nothing to preview). */
  const cancelHover = useCallback(() => {
    hoveredEntryIdRef.current = null;
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    setCard(null);
    setPreviewText(null);
  }, []);

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // The card exists to show what the row had to cut off. When the whole row
      // fits, it would repeat the text the user is already looking at.
      const rowText = event.currentTarget.querySelector<HTMLElement>('[data-tree-row-text]');
      if (rowText && rowText.scrollWidth <= rowText.clientWidth + 1) {
        cancelHover();
        return;
      }
      const dialogRect = dialogRef.current?.getBoundingClientRect();
      if (!dialogRect) return;
      const rowTop = event.currentTarget.getBoundingClientRect().top - dialogRect.top;
      const rowBottom = rowTop + ROW_HEIGHT_PX;
      if (dialogRect.height - rowBottom >= CARD_MAX_HEIGHT_PX + 16) {
        setCard({ entryId: entry.id, top: rowBottom + 8 });
      } else {
        setCard({ entryId: entry.id, bottom: dialogRect.height - rowTop + 8 });
      }
      hoveredEntryIdRef.current = entry.id;

      const cached = textCacheRef.current.get(entry.id);
      if (cached) {
        setPreviewText(cached);
        return;
      }
      setPreviewText(null);
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
      textTimerRef.current = setTimeout(() => {
        void (async () => {
          const result = await getEntryText(sessionPath, entry.id).catch(
            (): EntryTextResult => ({ success: false, text: '', truncated: false }),
          );
          textCacheRef.current.set(entry.id, result);
          if (hoveredEntryIdRef.current === entry.id) setPreviewText(result);
        })();
      }, TEXT_FETCH_DELAY_MS);
    },
    [cancelHover, sessionPath],
  );

  const scheduleCardHide = useCallback(() => {
    hoveredEntryIdRef.current = null;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setCard(null), HIDE_DELAY_MS);
  }, []);

  const cancelCardHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Esc clears the query first; closing the dialog takes a second Esc.
      if (event.key === 'Escape' && query !== '') {
        event.stopPropagation();
        setQuery('');
        return;
      }
      const treeInstance = treeRef.current;
      if (!treeInstance) return;
      if (event.key === 'ArrowDown') {
        const first = treeInstance.getItems()[0];
        if (!first) return;
        event.preventDefault();
        first.setFocused();
        treeInstance.updateDomFocus();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      // The list is already filtered, so the first row is the best match.
      const entry = treeInstance.getItems()[0]?.getItemData().entry;
      if (entry) onSelect(entry.id);
    },
    [onSelect, query],
  );

  const previewTextForCard = card ? previewText : null;

  // Filters and hover state are per visit: clearing them on close means the next
  // open starts fresh without an effect that sets state during render.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery('');
        setKinds(new Set());
        setCard(null);
        setPreviewText(null);
        firstFetchOfVisitRef.current = true;
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogRef}
        showCloseButton={false}
        className="flex h-[76vh] w-[min(880px,92vw)] max-w-[min(880px,92vw)] flex-col gap-0 overflow-hidden p-0"
        data-testid="session-tree-dialog"
        // Focus the search box instead of the dialog wrapper: the dialog makes
        // the rest of the app aria-hidden, and leaving focus on the toolbar
        // button that opened it is invalid.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          // Esc clears the filters first; only a second Esc closes the dialog.
          if (trimmedQuery === '' && kinds.size === 0) return;
          event.preventDefault();
          setQuery('');
          setKinds(new Set());
        }}
      >
        <DialogTitle className="sr-only">Session tree</DialogTitle>
        <DialogDescription className="sr-only">
          Every branch of this session. Pick a message to move the session there.
        </DialogDescription>

        <div className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-3">
          <IconSearch size={18} className="shrink-0 text-muted-foreground/60" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search this session"
            className="min-w-0 flex-1 bg-transparent pr-6 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground/55"
          />
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {isFiltered
              ? `${data?.itemCount ?? 0} of ${totalCount} messages`
              : treeCount > 1
                ? `${treeCount} trees · ${totalCount} messages`
                : `${totalCount} ${totalCount === 1 ? 'message' : 'messages'}`}
          </span>
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
                onClick={() => setKinds((previous) => toggleKinds(previous, chip.kinds))}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
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

        <div className="min-h-0 flex-1 overflow-hidden pb-3">
          {data === null ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : data.itemCount === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              No messages match
            </div>
          ) : (
            <SessionTreeList
              // A filtered tree, or another session, is a different dataset:
              // remounting keeps the tree state (expansion, focus) in step with
              // what is on screen.
              key={`${sessionPath}\u0000${trimmedQuery}\u0000${[...kinds].sort().join(',')}\u0000${loaded?.generation ?? 0}`}
              data={data}
              currentId={currentTree?.leafId ?? null}
              autoScroll={scrollGeneration === (loaded?.generation ?? -1)}
              treeRef={treeRef}
              onSelect={onSelect}
              onRowEnter={handleRowEnter}
              onRowLeave={scheduleCardHide}
            />
          )}
        </div>

        {card && (
          <div
            className="absolute right-3 z-10 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-[13px] leading-6 whitespace-pre-wrap text-foreground/85 shadow-lg"
            style={{
              top: card.top,
              bottom: card.bottom,
              width: CARD_WIDTH_PX,
              maxHeight: CARD_MAX_HEIGHT_PX,
            }}
            onMouseEnter={cancelCardHide}
            onMouseLeave={scheduleCardHide}
            data-testid="session-tree-preview"
          >
            {previewTextForCard === null ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : previewTextForCard.text ? (
              <>
                {previewTextForCard.text}
                {previewTextForCard.truncated && (
                  <div className="mt-2 text-xs text-muted-foreground">Text truncated</div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">No text in this message</span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SessionTreeListProps {
  data: SessionTreeData;
  currentId: string | null;
  /** Only the first dataset of a visit scrolls; a live refresh must not. */
  autoScroll: boolean;
  treeRef: React.RefObject<TreeInstance<SessionTreeItem> | null>;
  onSelect: (entryId: string) => void;
  onRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto) => void;
  onRowLeave: () => void;
}

function SessionTreeList({
  data,
  currentId,
  autoScroll,
  treeRef,
  onSelect,
  onRowEnter,
  onRowLeave,
}: SessionTreeListProps): React.JSX.Element {
  const tree = useTree<SessionTreeItem>({
    rootItemId: data.rootItemId,
    getItemName: (item) => item.getItemData().entry?.preview ?? '',
    isItemFolder: (item) => item.getItemData().childIds.length > 0,
    dataLoader: {
      getItem: (itemId) => data.getItem(itemId),
      getChildren: (itemId) => data.getChildren(itemId),
    },
    // Unfold everything except the trees the user is not in: with several
    // versions in one file, one long tree would otherwise push the others out
    // of sight. Their headers stay, so none of them can be missed.
    initialState: { expandedItems: expandedItemIds(data) },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
    onPrimaryAction: (item) => {
      const entry = item.getItemData().entry;
      if (entry) onSelect(entry.id);
    },
  });

  /** Fold or unfold one row. */
  const toggleFolded = useCallback((target: ItemInstance<SessionTreeItem>) => {
    if (target.isExpanded()) {
      target.collapse();
    } else {
      target.expand();
    }
  }, []);

  useEffect(() => {
    treeRef.current = tree;
    return () => {
      if (treeRef.current === tree) treeRef.current = null;
    };
  }, [tree, treeRef]);

  // Open at the current position, not at the top of a long session. A live
  // refresh must not yank the list: the user may be reading further up.
  useEffect(() => {
    if (!autoScroll || !currentId) return;
    tree.getItemInstance(currentId).getElement()?.scrollIntoView({ block: 'center' });
  }, [autoScroll, currentId, tree]);

  // headless-tree treats "nothing focused yet" as the first row being focused;
  // only show a cursor once the user actually moved into the tree.
  const focusedItemId = tree.getState().focusedItem;

  return (
    <div
      {...tree.getContainerProps('Session tree')}
      className="h-full overflow-y-auto px-2 outline-none"
      onScroll={onRowLeave}
    >
      {tree.getItems().map((item, index) => {
        const itemId = item.getId();
        const isRoot = item.getItemData().parentId === SESSION_TREE_ROOT_ID;
        return (
          <React.Fragment key={itemId}>
            {/* Several trees in one session file: a header per tree keeps them
                apart and tells the user how many versions there are. */}
            {isRoot && data.rootIds.length > 1 && (
              <TreeHeader
                item={item}
                position={data.rootIds.indexOf(itemId) + 1}
                isCurrent={itemId === data.currentRootId}
                stats={data.rootStatsById.get(itemId)}
                isFirst={index === 0}
                onToggleFold={toggleFolded}
              />
            )}
            <TreeRow
              item={item}
              data={data}
              matchIndexes={data.matchIndexesById.get(itemId)}
              isCurrent={itemId === currentId}
              isFocused={focusedItemId !== null && itemId === focusedItemId}
              onSelect={onSelect}
              onToggleFold={toggleFolded}
              onRowEnter={onRowEnter}
              onRowLeave={onRowLeave}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface TreeHeaderProps {
  item: ItemInstance<SessionTreeItem>;
  /** Number shown to the user, counted from the oldest tree. */
  position: number;
  isCurrent: boolean;
  stats: SessionTreeRootStats | undefined;
  isFirst: boolean;
  onToggleFold: (item: ItemInstance<SessionTreeItem>) => void;
}

/**
 * Section header for one of the session's trees.
 *
 * It pins to the top of the list, so in a long tree the user still knows which
 * version they are reading, and it folds the whole tree away — the escape hatch
 * for keeping every other version reachable.
 */
function TreeHeader({
  item,
  position,
  isCurrent,
  stats,
  isFirst,
  onToggleFold,
}: TreeHeaderProps): React.JSX.Element {
  const expanded = item.isExpanded();
  const range = stats ? formatTreeRange(stats) : '';
  return (
    <button
      type="button"
      onClick={() => onToggleFold(item)}
      className={cn(
        'sticky top-0 z-10 -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 bg-background px-2 py-1.5 text-left',
        !isFirst && 'border-t border-border/60',
      )}
      data-testid="session-tree-root-header"
    >
      <IconChevronRight
        size={12}
        className={cn(
          'shrink-0 text-muted-foreground transition-transform',
          expanded && 'rotate-90',
        )}
      />
      <span
        className={cn(
          'text-[11px] font-medium tracking-wide',
          isCurrent ? 'text-[var(--system-accent)]' : 'text-muted-foreground',
        )}
      >
        <IconBinaryTree size={13} className="mr-1 inline-block align-[-2px]" />
        Tree {position}
      </span>
      {stats && (
        <span className="text-[11px] text-muted-foreground/80">
          {stats.rowCount} {stats.rowCount === 1 ? 'message' : 'messages'}
        </span>
      )}
      {range !== '' && (
        <span className="ml-auto font-mono text-[11px] text-muted-foreground/60 tabular-nums">
          {range}
        </span>
      )}
    </button>
  );
}

interface TreeRowProps {
  item: ItemInstance<SessionTreeItem>;
  data: SessionTreeData;
  /** Character positions of the fuzzy match inside the row text. */
  matchIndexes: number[] | undefined;
  isCurrent: boolean;
  isFocused: boolean;
  onSelect: (entryId: string) => void;
  onToggleFold: (item: ItemInstance<SessionTreeItem>) => void;
  onRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto) => void;
  onRowLeave: () => void;
}

function TreeRow({
  item,
  data,
  matchIndexes,
  isCurrent,
  isFocused,
  onSelect,
  onToggleFold,
  onRowEnter,
  onRowLeave,
}: TreeRowProps): React.JSX.Element | null {
  const entry = item.getItemData().entry;
  if (!entry) return null;

  const description = describeSessionTreeEntry(entry);
  const isError = description.destructive === true;
  const depth = data.depthById.get(entry.id) ?? 0;
  const isBranchStart = data.branchStartIds.has(entry.id);
  const childCount = item.getItemData().childIds.length;
  // Chains have no fold affordance: the rows a fold would hide do not read as
  // children on screen.
  const canFold = childCount > 1 || (isBranchStart && childCount > 0);
  const isMetaKind = entry.kind === 'compaction' || entry.kind === 'branchSummary';
  const matched = matchIndexes !== undefined;

  return (
    <button
      {...item.getProps()}
      type="button"
      // Announce the indentation the user sees, not the message tree's depth.
      aria-level={depth + 1}
      // The library's default click folds folders; here a click moves the
      // session, and the chevron (or the arrow keys) folds.
      onClick={() => {
        item.setFocused();
        onSelect(entry.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onSelect(entry.id);
      }}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] text-foreground outline-none select-none',
        'hover:bg-muted/70',
        isFocused && 'ring-1 ring-ring/40 ring-inset',
        isCurrent && 'bg-[var(--system-accent)]/10 hover:bg-[var(--system-accent)]/15',
        matched && !isCurrent && 'bg-muted/50',
        !matched && !isCurrent && isMetaKind && 'bg-muted/40',
        isBranchStart && 'mt-0.5',
      )}
      style={{ height: ROW_HEIGHT_PX, paddingLeft: 8 }}
      data-tree-current={isCurrent ? 'true' : undefined}
      data-tree-match={matched ? 'true' : undefined}
      data-testid="session-tree-row"
      onMouseEnter={(event) => onRowEnter(event, entry)}
      onMouseLeave={onRowLeave}
    >
      <span
        className="relative h-full shrink-0"
        style={{ width: depth * INDENT_PX }}
        aria-hidden="true"
      >
        {Array.from({ length: depth }, (_, column) => (
          <span
            key={column}
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: column * INDENT_PX + INDENT_PX / 2 }}
          />
        ))}
      </span>

      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center text-muted-foreground',
          !canFold && 'invisible',
        )}
        aria-hidden="true"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFold(item);
        }}
      >
        <IconChevronRight
          size={13}
          className={cn('transition-transform', item.isExpanded() && 'rotate-90')}
        />
      </span>

      {/* Only the user's own turns are marked: they are the stops a rewind
          really rewinds to, everything else is content in between. */}
      {entry.kind === 'user' && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--system-accent)]/12 text-[var(--system-accent)]">
          <IconUser size={13} />
        </span>
      )}

      {description.label && (
        <span className="shrink-0 rounded bg-muted px-1 text-[11px] text-muted-foreground">
          {description.label}
        </span>
      )}

      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          description.monospace && 'font-mono text-xs',
          isError && 'text-destructive',
          !isError && entry.kind === 'user' && 'font-medium text-foreground',
          !isError && entry.kind === 'assistant' && 'text-foreground/80',
          !isError &&
            entry.kind !== 'user' &&
            entry.kind !== 'assistant' &&
            'text-muted-foreground',
        )}
        data-tree-row-text="true"
      >
        {renderMatchHighlight(description.text, matchIndexes)}
      </span>

      {isCurrent && (
        <span className="shrink-0 rounded-full bg-[var(--system-accent)]/12 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[var(--system-accent)] uppercase">
          Current
        </span>
      )}

      {description.trailing && (
        <span
          className={cn(
            'shrink-0 text-[11px] text-muted-foreground',
            isError && 'text-destructive',
          )}
        >
          {description.trailing}
        </span>
      )}

      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {formatSessionTreeTime(entry.timestamp)}
      </span>
    </button>
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

/** Wrap the fuzzy-matched characters in `text`; adjacent matches share a mark. */ function renderMatchHighlight(
  text: string,
  indexes: number[] | undefined,
): React.ReactNode {
  if (!indexes || indexes.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let runStart = -1;
  let runEnd = -1;

  const flushRun = (): void => {
    if (runStart < 0) return;
    if (runStart > cursor) nodes.push(text.slice(cursor, runStart));
    nodes.push(
      <mark key={runStart} className="rounded-sm bg-[var(--system-accent)]/20 text-inherit">
        {text.slice(runStart, runEnd + 1)}
      </mark>,
    );
    cursor = runEnd + 1;
    runStart = -1;
    runEnd = -1;
  };

  for (const index of indexes) {
    if (index <= runEnd) continue;
    if (runStart < 0) {
      runStart = index;
      runEnd = index;
      continue;
    }
    if (index === runEnd + 1) {
      runEnd = index;
      continue;
    }
    flushRun();
    runStart = index;
    runEnd = index;
  }
  flushRun();
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * Everything starts unfolded except the trees the user is not in.
 *
 * The rows of a collapsed tree are one click away, while a long tree left
 * expanded would push every other version below the fold.
 */
function expandedItemIds(data: SessionTreeData): string[] {
  if (data.rootIds.length <= 1) return data.allItemIds;
  const collapsedRoots = new Set(data.rootIds.filter((rootId) => rootId !== data.currentRootId));
  return data.allItemIds.filter((itemId) => !collapsedRoots.has(itemId));
}

/** "09:12 – 11:44", or a single time when a tree spans one minute. */
function formatTreeRange(stats: SessionTreeRootStats): string {
  const start = formatSessionTreeTime(stats.startTimestamp);
  const end = formatSessionTreeTime(stats.endTimestamp);
  return start === end ? start : `${start} – ${end}`;
}
