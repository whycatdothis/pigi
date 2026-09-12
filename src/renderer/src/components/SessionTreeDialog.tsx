import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  buildSessionTreeDisplay,
  collectBranchOwners,
  createSessionTreeData,
  describeSessionTreeEntry,
  formatSessionTreeTime,
  type SessionTreeData,
  type SessionTreeDisplayNode,
  type SessionTreeItem,
  type SessionTreeKind,
  type SessionTreeRailTint,
  type SessionTreeRootStats,
} from '../lib/sessionTreeData';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { SessionTreeHelpButton } from './SessionTreeHelpDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

/** Handed out when nothing is folded, so the identity stays stable. */
const EMPTY_STRING_SET: ReadonlySet<string> = new Set<string>();

/** Indent column width: a fork indents its children by exactly this much. */
const INDENT_PX = 20;
/** Row padding before the row's content (`pl-2`). */
const ROW_PADDING_PX = 8;
/** Room an indent column leaves before the content (the row's `gap-2`). */
const ROW_GAP_PX = 8;
/** Width of the fold chevron's box (`size-4`). */
const CHEVRON_PX = 16;
/** Height of a row; the hover preview and the branch elbows measure against it. */
const ROW_HEIGHT_PX = 32;
/**
 * Structure line width.
 *
 * A hairline: one whole pixel, so it never blurs into a grey bar and stays
 * thinner than any row chrome.
 */
const RAIL_WIDTH_PX = 1;
/** Extra space above a fork's direct children; the line spans it. */
const BRANCH_SPACING_PX = 2;
/**
 * Height of the last child's line: from the fork's own edge down to the middle
 * of that child's row, where its elbow takes over.
 */
const BRANCH_LAST_RAIL_HEIGHT_PX = BRANCH_SPACING_PX + ROW_HEIGHT_PX / 2;
/** The elbow sits on the pixel above the row's centre, like the line does. */
const BRANCH_ELBOW_TOP_PX = BRANCH_LAST_RAIL_HEIGHT_PX - RAIL_WIDTH_PX;
/**
 * From a fork's line to its child's content, corner included.
 *
 * The line leaves the fork at the centre of that row's chevron, so the elbow is
 * what is left of the indent once half a chevron is taken off — and it stops at
 * the chevron's box, never on the glyph. The corner pixel belongs to the line,
 * so the elbow element is one pixel shorter than this run.
 */
const BRANCH_ELBOW_WIDTH_PX = INDENT_PX - CHEVRON_PX / 2 + RAIL_WIDTH_PX;
/** Neutral structure line: quieter than the row text, still readable. */
const RAIL_COLOR = 'color-mix(in oklab, var(--foreground) 28%, transparent)';
/** Structure line on the active path, so the way back to the leaf stands out. */
const RAIL_COLOR_CURRENT = 'color-mix(in oklab, var(--system-accent) 60%, transparent)';
const CARD_WIDTH_PX = 380;
/** Distance between the card and the dialog's right edge. */
const CARD_INSET_PX = 12;
const CARD_MAX_HEIGHT_PX = 320;
const HIDE_DELAY_MS = 140;
/**
 * Grace period before the card follows the pointer onto another row.
 *
 * Reaching the card means crossing the rows in between (the card is on the
 * other side of them), and switching the moment a row is entered would pull the
 * card away from under the pointer. The pointer staying on the row longer than
 * this still switches.
 */
const CARD_SWITCH_DELAY_MS = 200;

/** Kind filter chips; a chip toggles every kind in its group. */
const KIND_FILTER_CHIPS: { label: string; kinds: SessionTreeKind[] }[] = [
  { label: 'User', kinds: ['user'] },
  { label: 'Assistant', kinds: ['assistant'] },
  { label: 'Tools', kinds: ['toolResult'] },
  { label: 'Summaries', kinds: ['compaction', 'branchSummary'] },
];
const TEXT_FETCH_DELAY_MS = 100;

/** Structure line colour for a rail or an elbow. */
function railColor(tinted: boolean): string {
  return tinted ? RAIL_COLOR_CURRENT : RAIL_COLOR;
}

/**
 * Where a row at `depth` starts drawing: the left edge of its fold chevron.
 *
 * Rows are as wide as the list, so this is measured from the row's own box —
 * the indentation is the row's padding, not a narrow gutter element.
 */
function rowContentX(depth: number): number {
  return ROW_PADDING_PX + depth * INDENT_PX + ROW_GAP_PX;
}

/**
 * Centre of the fold chevron at `depth`.
 *
 * A fork's line hangs from the chevron of the row it starts at, so this is
 * where that column lives.
 */
function chevronCentreX(depth: number): number {
  return rowContentX(depth) + CHEVRON_PX / 2;
}

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
  /** The row the pointer is on; its branch line lights up. */
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<EntryTextResult | null>(null);
  /** Trees the user folded open or shut; the default comes from the leaf. */
  const [treeFoldOverrides, setTreeFoldOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );

  const toggleTree = useCallback((treeId: string): void => {
    setTreeFoldOverrides((previous) => {
      const collapsed = previous.get(treeId) ?? false;
      const next = new Map(previous);
      next.set(treeId, !collapsed);
      return next;
    });
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<TreeInstance<SessionTreeItem> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Entry the card currently shows; null when no card is up. */
  const cardEntryIdRef = useRef<string | null>(null);
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
  // Several versions in one file: a long tree left open would push the others
  // out of sight, so the trees the leaf is not in start folded. A search or a
  // filter is about rows, not versions, so it keeps every tree open.
  const collapsedTreeIds = useMemo(() => {
    if (!data || data.isFiltered) return EMPTY_STRING_SET;
    return new Set(
      data.treeIds.filter(
        (treeId) => !(treeFoldOverrides.get(treeId) ?? treeId === data.currentRootId),
      ),
    );
  }, [data, treeFoldOverrides]);

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
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
    },
    [],
  );

  const clearSwitchTimer = useCallback(() => {
    if (switchTimerRef.current) {
      clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
  }, []);

  // Entering the card keeps it: it also cancels a switch the pointer started
  // while crossing the rows on its way here.
  const cancelCardHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    clearSwitchTimer();
  }, [clearSwitchTimer]);

  /** Drop the card and any pending preview read (a row with nothing to preview). */
  const cancelHover = useCallback(() => {
    hoveredEntryIdRef.current = null;
    cardEntryIdRef.current = null;
    clearSwitchTimer();
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    setCard(null);
    setPreviewText(null);
  }, [clearSwitchTimer]);

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // The card exists to show what the row had to cut off. When the whole row
      // fits, it would repeat the text the user is already looking at — dropping
      // the open card, but only after the grace period, because the pointer may
      // just be crossing this row on its way to the card.
      const rowText = event.currentTarget.querySelector<HTMLElement>('[data-tree-row-text]');
      const rowTextFits = rowText !== null && rowText.scrollWidth <= rowText.clientWidth + 1;
      const dialogRect = dialogRef.current?.getBoundingClientRect();
      if (!dialogRect) return;
      const rowTop = event.currentTarget.getBoundingClientRect().top - dialogRect.top;
      const rowBottom = rowTop + ROW_HEIGHT_PX;

      const showCard = (): void => {
        if (rowTextFits) {
          cancelHover();
          return;
        }
        // The card overlaps the hovered row instead of hanging below it: its
        // hover area starts at the row's own edge, so the pointer can travel
        // sideways into the card without ever touching the rows in between (the
        // card is on the far right, the pointer usually mid-row).
        if (dialogRect.height - rowTop >= CARD_MAX_HEIGHT_PX + 16) {
          setCard({ entryId: entry.id, top: rowTop });
        } else {
          setCard({ entryId: entry.id, bottom: dialogRect.height - rowBottom });
        }
        cardEntryIdRef.current = entry.id;
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
      };

      clearSwitchTimer();
      if (cardEntryIdRef.current !== null && cardEntryIdRef.current !== entry.id) {
        switchTimerRef.current = setTimeout(() => {
          switchTimerRef.current = null;
          if (cardEntryIdRef.current !== entry.id) showCard();
        }, CARD_SWITCH_DELAY_MS);
        return;
      }
      showCard();
    },
    [cancelHover, clearSwitchTimer, sessionPath],
  );

  const scheduleCardHide = useCallback(() => {
    hoveredEntryIdRef.current = null;
    clearSwitchTimer();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      cardEntryIdRef.current = null;
      setCard(null);
    }, HIDE_DELAY_MS);
  }, [clearSwitchTimer]);

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

  /** Hovering a row lights its own branch line up to every fork above it. */
  const handleRowPath = useCallback((rowId: string | null): void => {
    setHoverRowId((previous) => (previous === rowId ? previous : rowId));
  }, []);

  const previewTextForCard = card ? previewText : null;

  // Filters and hover state are per visit: clearing them on close means the next
  // open starts fresh without an effect that sets state during render.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery('');
        setKinds(new Set());
        setTreeFoldOverrides(new Map());
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
              collapsedTreeIds={collapsedTreeIds}
              onToggleTree={toggleTree}
              hoverRowId={hoverRowId}
              onSelect={onSelect}
              onRowEnter={handleRowEnter}
              onRowLeave={scheduleCardHide}
              onRowPath={handleRowPath}
            />
          )}
        </div>

        {card && (
          // The wrapper is transparent and reaches the row's edge; the margin on
          // the card below it draws the visual gap. Its hover area is what makes
          // the trip from the row into the card safe: the pointer never leaves a
          // hovered element, so no row in between steals the card.
          <div
            className="absolute right-0 z-10"
            style={{ top: card.top, bottom: card.bottom, width: CARD_WIDTH_PX + CARD_INSET_PX }}
            onMouseEnter={cancelCardHide}
            onMouseLeave={scheduleCardHide}
          >
            <div
              className={cn(
                'mr-3 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-[13px] leading-6 whitespace-pre-wrap text-foreground/85 shadow-lg',
                card.top !== undefined ? 'mt-1.5' : 'mb-1.5',
              )}
              style={{ maxHeight: CARD_MAX_HEIGHT_PX }}
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
  /** Folded-away trees: their rows are left out of the list entirely. */
  collapsedTreeIds: ReadonlySet<string>;
  onToggleTree: (treeId: string) => void;
  /** The row whose line the pointer is on; its path lights up. */
  hoverRowId: string | null;
  onSelect: (entryId: string) => void;
  onRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto) => void;
  onRowLeave: () => void;
  /** The hovered row, or null when the pointer left the rows. */
  onRowPath: (rowId: string | null) => void;
}

function SessionTreeList({
  data,
  currentId,
  autoScroll,
  treeRef,
  collapsedTreeIds,
  onToggleTree,
  hoverRowId,
  onSelect,
  onRowEnter,
  onRowLeave,
  onRowPath,
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

  const containerRef = useRef<HTMLDivElement | null>(null);

  // The rows the tree currently shows (folds and filters applied), and how they
  // nest: the recursion below renders exactly this, so both stay in step.
  const visibleItemIds = tree
    .getItems()
    .map((item) => item.getId())
    .filter((itemId) => !collapsedTreeIds.has(data.treeRootIdByItemId.get(itemId) ?? itemId));
  const display = buildSessionTreeDisplay(data, new Set(visibleItemIds), hoverRowId);

  // One group per tree, in session order, so the header of a folded tree stays
  // on screen while its rows do not. A filter can leave several roots for one
  // tree (its root row dropped, rows re-attaching higher up): grouping by tree
  // rather than by position in the list keeps those rows under one header.
  const nodesByTreeId = new Map<string, SessionTreeDisplayNode[]>();
  for (const node of display.nodes) {
    const treeId = data.treeRootIdByItemId.get(node.itemId) ?? node.itemId;
    const nodes = nodesByTreeId.get(treeId);
    if (nodes) nodes.push(node);
    else nodesByTreeId.set(treeId, [node]);
  }
  const treeGroups = data.treeIds.map((treeId, index) => ({
    treeId,
    position: index + 1,
    nodes: nodesByTreeId.get(treeId) ?? [],
  }));

  /** Fold or unfold one row. */
  const toggleFolded = useCallback((target: ItemInstance<SessionTreeItem>) => {
    if (target.isExpanded()) {
      target.collapse();
    } else {
      target.expand();
    }
  }, []);

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto): void => {
      onRowPath(entry.id);
      onRowEnter(event, entry);
    },
    [onRowEnter, onRowPath],
  );

  const handleRowLeave = useCallback((): void => {
    onRowPath(null);
    onRowLeave();
  }, [onRowLeave, onRowPath]);

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

  const rowContext: SessionTreeRowContext = {
    data,
    tree,
    currentId,
    onSelect,
    onToggleFold: toggleFolded,
    onRowEnter: handleRowEnter,
    onRowLeave: handleRowLeave,
  };

  return (
    <div
      {...tree.getContainerProps('Session tree')}
      ref={containerRef}
      className="h-full overflow-y-auto px-2 outline-none"
      // Scrolling moves the rows out from under the pointer.
      onScroll={handleRowLeave}
    >
      {/* The ancestor band sticks inside the list, above the rows and the tree
          headers (`z-20`), and takes no space in the flow. */}
      <PinnedAncestors
        containerRef={containerRef}
        parentById={display.parentById}
        depthById={display.depthById}
        visibleRowCount={display.nodes.length > 0 ? tree.getItems().length : 0}
        rowContext={rowContext}
      />
      {treeGroups.map((group, groupIndex) => (
        <React.Fragment key={group.treeId}>
          {/* Several trees in one session file: a header per tree keeps them
              apart and tells the user how many versions there are. It stays up
              while searching, so a match is still placed in its version. */}
          {data.treeIds.length > 1 && (
            <TreeHeader
              position={group.position}
              isCurrent={group.treeId === data.currentRootId}
              expanded={!collapsedTreeIds.has(group.treeId)}
              stats={data.rootStatsById.get(group.nodes[0]?.itemId ?? group.treeId)}
              isFirst={groupIndex === 0}
              onToggle={() => onToggleTree(group.treeId)}
            />
          )}
          {group.nodes.map((node) => (
            <SessionTreeDisplayRow
              key={node.itemId}
              node={node}
              level={1}
              isBranchChild={false}
              rowContext={rowContext}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * State the whole row recursion shares.
 *
 * Threading one object keeps the recursion (a row, its continuation, its
 * branches) readable: every level needs the same handlers, the same tree and
 * the same hovered path.
 */
interface SessionTreeRowContext {
  data: SessionTreeData;
  tree: TreeInstance<SessionTreeItem>;
  currentId: string | null;
  onSelect: (entryId: string) => void;
  onToggleFold: (item: ItemInstance<SessionTreeItem>) => void;
  onRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntryDto) => void;
  onRowLeave: () => void;
}

interface SessionTreeDisplayRowProps {
  node: SessionTreeDisplayNode;
  /** Nesting level of this row; the roots start at 1 (ARIA's first level). */
  level: number;
  isBranchChild: boolean;
  rowContext: SessionTreeRowContext;
}

/**
 * One row, plus everything that hangs under it.
 *
 * A lone child continues at the same level, so it renders right here as a
 * sibling; a fork hands each child to a `TreeBranch`, which owns the line the
 * child hangs from. Neither branch nor continuation adds a wrapper, so a long
 * conversation stays a flat list in the DOM.
 */
function SessionTreeDisplayRow({
  node,
  level,
  isBranchChild,
  rowContext,
}: SessionTreeDisplayRowProps): React.JSX.Element {
  const { data, tree, currentId } = rowContext;
  const item = tree.getItemInstance(node.itemId);
  const depth = level - 1;
  const branch = node.branch;

  return (
    <>
      <TreeRow
        item={item}
        level={level}
        depth={depth}
        isBranchChild={isBranchChild}
        matchIndexes={data.matchIndexesById.get(node.itemId)}
        isCurrent={node.itemId === currentId}
        rowContext={rowContext}
      />
      {node.continuation && (
        <SessionTreeDisplayRow
          node={node.continuation}
          level={level}
          isBranchChild={false}
          rowContext={rowContext}
        />
      )}
      {branch?.map((childNode, index) => (
        <TreeBranch
          key={childNode.itemId}
          forkDepth={depth}
          isLast={index === branch.length - 1}
          railTint={childNode.railTint}
          elbowTinted={childNode.elbowTint}
        >
          <SessionTreeDisplayRow
            node={childNode}
            level={level + 1}
            isBranchChild
            rowContext={rowContext}
          />
        </TreeBranch>
      ))}
    </>
  );
}

interface TreeBranchProps {
  /** Depth of the row the branch starts at; its chevron column carries the line. */
  forkDepth: number;
  /**
   * The last child: its line stops at the middle of its own row, so the fork
   * ends where the branch visibly ends instead of running on into the subtree.
   */
  isLast: boolean;
  /** How much of this child's line is the lit path (see the display builder). */
  railTint: SessionTreeRailTint;
  /** The path turns into this child here. */
  elbowTinted: boolean;
  children: React.ReactNode;
}

/**
 * One child of a fork, and the line it hangs from.
 *
 * The wrapper spans the child's whole subtree, which is what makes the line
 * continuous: siblings sit next to each other, so their lines join without a
 * seam, and no row has to know where the fork above it started.
 */
function TreeBranch({
  forkDepth,
  isLast,
  railTint,
  elbowTinted,
  children,
}: TreeBranchProps): React.JSX.Element {
  // The pixel just left of the chevron's centre, so the hairline stays whole.
  const lineLeft = chevronCentreX(forkDepth) - RAIL_WIDTH_PX;

  return (
    // The spacing sits on the wrapper rather than on the row, so the line above
    // reaches down to the fork's edge and the siblings stay joined.
    <div className="relative" style={{ paddingTop: BRANCH_SPACING_PX }} data-tree-branch="true">
      {/*
        The line is two pieces: the run from the fork's edge down to the turn
        into this child, and the run below it, which carries the fork on to the
        next sibling. A path that turns in here lights the first; a path that
        passes by on its way to a later sibling lights both. The last child has
        no second piece: its line stops at its own centre.
      */}
      <span
        className="absolute"
        aria-hidden="true"
        style={{
          left: lineLeft,
          top: 0,
          width: RAIL_WIDTH_PX,
          height: BRANCH_LAST_RAIL_HEIGHT_PX,
          background: railColor(railTint !== 'none'),
        }}
      />
      {!isLast && (
        <span
          className="absolute"
          aria-hidden="true"
          style={{
            left: lineLeft,
            top: BRANCH_LAST_RAIL_HEIGHT_PX,
            width: RAIL_WIDTH_PX,
            bottom: 0,
            background: railColor(railTint === 'full'),
          }}
        />
      )}
      <span
        className="absolute"
        aria-hidden="true"
        style={{
          // Starts one pixel to the right of the line: that pixel is the corner
          // itself, and painting it twice would darken it (the lines are
          // translucent) and, with an accented fork, mix two different colours.
          left: lineLeft + RAIL_WIDTH_PX,
          top: BRANCH_ELBOW_TOP_PX,
          width: BRANCH_ELBOW_WIDTH_PX - RAIL_WIDTH_PX,
          height: RAIL_WIDTH_PX,
          background: railColor(elbowTinted),
        }}
      />
      {children}
    </div>
  );
}

interface TreeHeaderProps {
  /** Number shown to the user, counted from the oldest tree. */
  position: number;
  isCurrent: boolean;
  expanded: boolean;
  stats: SessionTreeRootStats | undefined;
  isFirst: boolean;
  onToggle: () => void;
}

/**
 * Section header for one of the session's trees.
 *
 * It pins to the top of the list, so in a long tree the user still knows which
 * version they are reading, and it folds the whole tree away — the escape hatch
 * for keeping every other version reachable.
 */
function TreeHeader({
  position,
  isCurrent,
  expanded,
  stats,
  isFirst,
  onToggle,
}: TreeHeaderProps): React.JSX.Element {
  const range = stats ? formatTreeRange(stats) : '';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        // Opaque stand-in for the dialog's own surface: a translucent header
        // would tint a second time (a 6-level white band in light mode) and let
        // the rows scroll through it.
        'sticky top-0 z-10 -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 bg-[var(--dialog-solid)] px-2 py-1.5 text-left',
        !isFirst && 'border-t border-border/60',
      )}
      data-testid="session-tree-root-header"
    >
      <IconChevronRight
        size={16}
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
        <IconBinaryTree size={14} className="mr-1 inline-block align-[-3px] [stroke-width:2.5]" />
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
  /** ARIA level: the nesting the user sees, not the message tree's depth. */
  level: number;
  /** Indent of this row's content; `level` counts from one, depth from zero. */
  depth: number;
  /**
   * The row is a fork's direct child, so it hangs from a branch line and
   * folding it hides a branch rather than hiding a continuation.
   */
  isBranchChild: boolean;
  /** Character positions of the fuzzy match inside the row text. */
  matchIndexes: number[] | undefined;
  isCurrent: boolean;
  rowContext: SessionTreeRowContext;
}

function TreeRow({
  item,
  level,
  depth,
  isBranchChild,
  matchIndexes,
  isCurrent,
  rowContext,
}: TreeRowProps): React.JSX.Element | null {
  const { onSelect, onToggleFold, onRowEnter, onRowLeave } = rowContext;
  const entry = item.getItemData().entry;
  if (!entry) return null;

  const matched = matchIndexes !== undefined;
  const { canFold, description, isMetaKind, isError } = describeRow(item, isBranchChild);

  return (
    <button
      {...item.getProps()}
      type="button"
      // Announce the indentation the user sees, not the message tree's depth.
      aria-level={level}
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
        // The row spans the list, so the gutter a branch line runs through stays
        // part of its click and hover target; the highlight itself sits on the
        // content box below, which starts where the row's content starts.
        'group flex w-full items-center text-left text-[13px] text-foreground outline-none select-none',
      )}
      style={{ height: ROW_HEIGHT_PX, paddingLeft: rowContentX(depth) }}
      data-tree-current={isCurrent ? 'true' : undefined}
      data-tree-match={matched ? 'true' : undefined}
      data-tree-row-id={item.getId()}
      data-testid="session-tree-row"
      onMouseEnter={(event) => onRowEnter(event, entry)}
      onMouseLeave={onRowLeave}
    >
      <span
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pr-2',
          // Hover is read off the row (a `group-hover`), so pointing at the
          // indentation highlights the same box as pointing at the text. One
          // hover class for every row: the current row is marked by its chip,
          // not by a background, so hover reads the same wherever it lands.
          'group-hover:bg-foreground/10',
          matched && 'bg-muted/50',
          !matched && isMetaKind && 'bg-muted/40',
        )}
      >
        <TreeRowContent
          item={item}
          entry={entry}
          description={description}
          canFold={canFold}
          isError={isError}
          isCurrent={isCurrent}
          matchIndexes={matchIndexes}
          onToggleFold={() => onToggleFold(item)}
        />
      </span>
    </button>
  );
}

/** Everything a row shows, plus what its kind means for the styling. */
function describeRow(
  item: ItemInstance<SessionTreeItem>,
  isBranchChild: boolean,
): {
  canFold: boolean;
  description: ReturnType<typeof describeSessionTreeEntry>;
  isMetaKind: boolean;
  isError: boolean;
} {
  const entry = item.getItemData().entry;
  const description = describeSessionTreeEntry(entry as SessionTreeEntryDto);
  const childCount = item.getItemData().childIds.length;
  return {
    // Chains have no fold affordance: the rows a fold would hide do not read as
    // children on screen.
    canFold: childCount > 1 || (isBranchChild && childCount > 0),
    description,
    isMetaKind: entry?.kind === 'compaction' || entry?.kind === 'branchSummary',
    isError: description.destructive === true,
  };
}

interface TreeRowContentProps {
  item: ItemInstance<SessionTreeItem>;
  entry: SessionTreeEntryDto;
  description: ReturnType<typeof describeSessionTreeEntry>;
  canFold: boolean;
  isError: boolean;
  /** The session's position: marked with a chip, never with a background. */
  isCurrent: boolean;
  /** Skipped for the copy the pinned list shows: it is not a control there. */
  matchIndexes?: number[];
  onToggleFold?: () => void;
}

/**
 * The row's insides, shared by the list and by the pinned copies at its top.
 *
 * A pinned row has to be recognisable as the row it stands for, so it renders
 * the same content — only the shell around it differs.
 */
function TreeRowContent({
  item,
  entry,
  description,
  canFold,
  isError,
  isCurrent,
  matchIndexes,
  onToggleFold,
}: TreeRowContentProps): React.JSX.Element {
  return (
    <>
      <span
        className={cn(
          'relative flex shrink-0 items-center justify-center text-muted-foreground',
          !canFold && 'invisible',
        )}
        style={{ width: CHEVRON_PX, height: CHEVRON_PX }}
        aria-hidden="true"
        onClick={
          onToggleFold
            ? (event) => {
                event.stopPropagation();
                onToggleFold();
              }
            : undefined
        }
      >
        {/*
          The chevron is small, so folding gets a hit area as tall as the row: a
          near miss must not land on the row, where a click moves the session
          instead. Only the real rows take it — the pinned copies navigate.
        */}
        {onToggleFold && <span className="absolute" style={{ inset: '-8px -6px' }} />}
        <IconChevronRight
          size={16}
          // Default stroke: at 16px the chevron is already bigger than the icons
          // around it, and a thicker line reads as bold next to them.
          className={cn('transition-transform', item.isExpanded() && 'rotate-90')}
        />
      </span>

      {/* Only the user's own turns are marked: they are the stops a rewind
          really rewinds to, everything else is content in between. */}
      {entry.kind === 'user' && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--system-accent)]/12 text-[var(--system-accent)]">
          <IconUser size={13} className="[stroke-width:2.5]" />
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
        // A chip rather than a tinted row: the position has to be readable while
        // the pointer is on it, and a background would be covered by the hover.
        <span className="shrink-0 rounded-sm bg-[var(--system-accent)]/12 px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--system-accent)]">
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
    </>
  );
}

interface PinnedRowProps {
  itemId: string;
  /** The row's indent level; the pinned stack steps outward to the root. */
  depth: number;
  /** The bottom-most pinned row carries the edge that ends the band. */
  isLast: boolean;
  rowContext: SessionTreeRowContext;
}

/**
 * One ancestor row, pinned to the top of the list.
 *
 * It is a copy: the same content, the same indent, an opaque background so rows
 * scrolling underneath stay hidden. Clicking it moves the session like the row
 * itself would.
 */
function PinnedRow({
  itemId,
  depth,
  isLast,
  rowContext,
}: PinnedRowProps): React.JSX.Element | null {
  const { tree, currentId, onSelect } = rowContext;
  const item = tree.getItemInstance(itemId);
  const entry = item.getItemData().entry;
  if (!entry) return null;
  const { canFold, description, isError } = describeRow(item, true);

  return (
    <div
      className={cn('group flex w-full items-center', isLast && 'border-b border-border/60')}
      style={{ height: ROW_HEIGHT_PX, paddingLeft: rowContentX(depth), background: PINNED_BG }}
      data-testid="session-tree-pinned-row"
      onClick={() => onSelect(entry.id)}
    >
      <span
        className={cn(
          'flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pr-2',
          // The same hover the rows themselves use: the pinned copies must read
          // as rows, so they hover like them.
          'group-hover:bg-foreground/10',
        )}
      >
        <TreeRowContent
          item={item}
          entry={entry}
          description={description}
          canFold={canFold}
          isError={isError}
          isCurrent={entry.id === currentId}
        />
      </span>
    </div>
  );
}

/** Opaque stand-in for the dialog's surface, like the tree headers use. */
const PINNED_BG = 'var(--dialog-solid)';

interface PinnedAncestorsProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  parentById: ReadonlyMap<string, string>;
  depthById: ReadonlyMap<string, number>;
  /** Folding and filtering change this, and the row offsets with it. */
  visibleRowCount: number;
  rowContext: SessionTreeRowContext;
}

/**
 * The branch line the list is currently showing, pinned to its top.
 *
 * Scrolling past a fork used to hide who the visible rows hang from. This
 * mirrors the list with the ancestors of the top-most visible row — one row per
 * indent level, so the stack is as tall as the nesting, not as long as the
 * conversation. It sticks above the rows (`z-20`) and takes no space in the
 * flow, so nothing shifts when it appears.
 */
function PinnedAncestors({
  containerRef,
  parentById,
  depthById,
  visibleRowCount,
  rowContext,
}: PinnedAncestorsProps): React.JSX.Element | null {
  const [pinned, setPinned] = useState<{ id: string; depth: number }[]>([]);
  /** Height of the tree header band, so the stack starts under it. */
  const [headerHeight, setHeaderHeight] = useState(0);
  const layoutRef = useRef<{ ids: string[]; tops: number[]; headerHeight: number }>({
    ids: [],
    tops: [],
    headerHeight: 0,
  });

  const update = useCallback((): void => {
    const container = containerRef.current;
    if (!container) return;
    const { ids, tops, headerHeight } = layoutRef.current;
    if (ids.length === 0) {
      setPinned((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    // The row the reader is looking at: the last one that starts above the
    // header band. Its own height does not count, so the stack cannot push
    // itself into a different answer.
    const threshold = container.scrollTop + headerHeight;
    let index = 0;
    for (let candidate = 0; candidate < tops.length; candidate += 1) {
      if (tops[candidate] > threshold) break;
      index = candidate;
    }
    const next = collectBranchOwners(ids[index], parentById, depthById);
    setPinned((previous) =>
      previous.length === next.length && previous.every((row, i) => row.id === next[i].id)
        ? previous
        : next,
    );
  }, [containerRef, depthById, parentById]);

  /**
   * Read every row's offset once per row set.
   *
   * Re-measuring on scroll would be the expensive part of this feature (a
   * forced layout per frame), so the offsets are cached until the list's rows
   * change — which folding and filtering do, and which `visibleRowCount` tells
   * us about without any DOM work.
   */
  const measure = useCallback((): void => {
    const container = containerRef.current;
    if (!container) return;
    const elements = container.querySelectorAll<HTMLElement>('[data-tree-row-id]');
    if (elements.length === layoutRef.current.ids.length && layoutRef.current.tops.length > 0) {
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const header = container.querySelector<HTMLElement>('[data-testid=session-tree-root-header]');
    const measuredHeaderHeight = header?.getBoundingClientRect().height ?? 0;
    layoutRef.current = {
      ids: [...elements].map((element) => element.dataset.treeRowId ?? ''),
      tops: [...elements].map((element) => element.getBoundingClientRect().top - containerTop),
      headerHeight: measuredHeaderHeight,
    };
    setHeaderHeight(measuredHeaderHeight);
    update();
  }, [containerRef, update]);

  useLayoutEffect(() => {
    measure();
  }, [measure, visibleRowCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const onScroll = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [containerRef, update]);

  if (pinned.length === 0) return null;

  return (
    <div
      className="sticky top-0 z-20 h-0"
      style={{ paddingTop: headerHeight }}
      aria-hidden="true"
      data-testid="session-tree-pinned"
    >
      {pinned.map((ancestor, index) => (
        <PinnedRow
          key={ancestor.id}
          itemId={ancestor.id}
          depth={ancestor.depth}
          isLast={index === pinned.length - 1}
          rowContext={rowContext}
        />
      ))}
    </div>
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
 * Every row starts unfolded.
 *
 * Versions fold as a whole (`collapsedTreeIds` in the dialog): folding a tree
 * through the row items would leave its rows in the DOM, and a fold that hides
 * some of a tree's roots but not the others has no meaning.
 */
function expandedItemIds(data: SessionTreeData): string[] {
  return data.allItemIds;
}

/** "09:12 – 11:44", or a single time when a tree spans one minute. */
function formatTreeRange(stats: SessionTreeRootStats): string {
  const start = formatSessionTreeTime(stats.startTimestamp);
  const end = formatSessionTreeTime(stats.endTimestamp);
  return start === end ? start : `${start} – ${end}`;
}
