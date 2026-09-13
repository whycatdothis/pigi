import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TreeInstance } from '@headless-tree/core';
import type { SessionTree } from '../../../../shared/ipcContract';
import { getSessionTree } from '../../services/piAgentClient';
import {
  createSessionTreeData,
  type SessionTreeItem,
  type SessionTreeKind,
} from '../../lib/sessionTreeData';
import { toast } from 'sonner';
import { useSessionTreePreview } from '../../hooks/useSessionTreePreview';
import {
  CARD_GAP_PX,
  CARD_INSET_PX,
  CARD_MAX_HEIGHT_PX,
  CARD_WIDTH_PX,
} from './sessionTreeGeometry';
import { SessionTreeList } from './SessionTreeList';
import { SessionTreeToolbar } from './SessionTreeToolbar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

/** Handed out when nothing is folded, so the identity stays stable. */
const EMPTY_STRING_SET: ReadonlySet<string> = new Set<string>();

/**
 * Move the keyboard selection by one row.
 *
 * The search box keeps the caret — the selection moves under it, so typing keeps
 * working while the list shows what Enter would take. Unlike the library's own
 * `focusNextItem`, this starts at the first row when nothing is selected yet.
 */
function moveSelection(tree: TreeInstance<SessionTreeItem>, step: number): void {
  const items = tree.getItems();
  if (items.length === 0) return;
  const selectedId = tree.getState().focusedItem;
  const selectedIndex = items.findIndex((item) => item.getId() === selectedId);
  const nextIndex = Math.min(Math.max(selectedIndex + step, 0), items.length - 1);
  // The list brings the focused row into view: an off-screen row has no element
  // of its own to scroll to.
  items[nextIndex]?.setFocused();
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
 * This is the shell: the dialog around the tree, the read behind it and the
 * state a visit owns (search, filters, which versions are folded). The list,
 * its rows and the hover preview each live next to it.
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
    tree: SessionTree;
    generation: number;
  } | null>(null);
  const generationRef = useRef(0);
  /** The first dataset of a visit scrolls to the current row; a refresh must not. */
  const firstFetchOfVisitRef = useRef(true);
  const [scrollGeneration, setScrollGeneration] = useState(0);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<ReadonlySet<SessionTreeKind>>(() => new Set());
  /** The row the pointer is on; its branch line lights up. */
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  /** Whether the user expanded or folded a tree; the default comes from the leaf. */
  const [treeExpandedOverrides, setTreeExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<TreeInstance<SessionTreeItem> | null>(null);

  const currentTree = loaded?.path === sessionPath ? loaded.tree : null;
  const data = useMemo(
    () => (currentTree ? createSessionTreeData(currentTree, { query, kinds }) : null),
    [currentTree, query, kinds],
  );
  const trimmedQuery = query.trim();
  const totalCount = currentTree?.entries.length ?? 0;
  const treeCount = data?.rootIds.length ?? 0;
  const { card, previewText, handleRowEnter, cancelCardHide, scheduleCardHide, resetPreview } =
    useSessionTreePreview({ sessionPath, dialogRef });

  // Several versions in one file: a long tree left open would push the others
  // out of sight, so the trees the leaf is not in start folded. A search or a
  // filter is about rows, not versions, so it keeps every tree open.
  const currentRootId = data?.currentRootId;
  const collapsedTreeIds = useMemo(() => {
    if (!data || data.isFiltered) return EMPTY_STRING_SET;
    return new Set(
      data.treeIds.filter(
        (treeId) => !isTreeExpanded(treeId, treeExpandedOverrides, currentRootId),
      ),
    );
  }, [data, treeExpandedOverrides, currentRootId]);

  const toggleTree = useCallback(
    (treeId: string): void => {
      setTreeExpandedOverrides((previous) => {
        // Flip what the reader is looking at, not the last thing written down: a
        // tree with no entry yet is still where the dialog started it, and the
        // first click on an open header has to fold it.
        const next = new Map(previous);
        next.set(treeId, !isTreeExpanded(treeId, previous, currentRootId));
        return next;
      });
    },
    [currentRootId],
  );

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
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(treeInstance, event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      // Enter takes the row the list highlights: where the arrow keys moved to, the
      // first match after a search, or the first row of a filtered list. Taking the
      // first row of a search would land on the ancestor that carries the match.
      const targetId = treeInstance.getState().focusedItem ?? treeInstance.getItems()[0]?.getId();
      const entry = targetId === undefined ? undefined : data?.getItem(targetId).entry;
      if (entry) onSelect(entry.id);
    },
    [data, onSelect, query],
  );

  /** Hovering a row lights its own branch line up to every fork above it. */
  const handleRowPath = useCallback((rowId: string | null): void => {
    setHoverRowId((previous) => (previous === rowId ? previous : rowId));
  }, []);

  // What the keyboard is on after a search or a filter: the first match, so the row
  // Enter would take is the row the list shows as selected. The caret stays in the
  // search box — the selection moves under it.
  useEffect(() => {
    const treeInstance = treeRef.current;
    if (!treeInstance || !data) return;
    const firstMatchId = data.matchIndexesById.keys().next().value;
    const targetId =
      firstMatchId ?? (data.isFiltered ? treeInstance.getItems()[0]?.getId() : undefined);
    if (targetId === undefined) return;
    treeInstance.getItemInstance(targetId).setFocused();
  }, [data]);

  // Filters, folds and the preview are per visit: clearing them on close means
  // the next open starts fresh without an effect that sets state during render.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery('');
        setKinds(new Set());
        setTreeExpandedOverrides(new Map());
        resetPreview();
        firstFetchOfVisitRef.current = true;
        // The next visit starts with no row highlighted.
        treeRef.current?.applySubStateUpdate('focusedItem', null);
      }
      onOpenChange(next);
    },
    [onOpenChange, resetPreview],
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

        <SessionTreeToolbar
          inputRef={inputRef}
          query={query}
          onQueryChange={setQuery}
          onKeyDown={handleSearchKeyDown}
          kinds={kinds}
          onKindsChange={setKinds}
          itemCount={data?.itemCount ?? 0}
          totalCount={totalCount}
          treeCount={treeCount}
        />

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
              // what is on screen. A live refresh is the same dataset with more
              // rows, so it updates in place — remounting there would fold back
              // every row the reader opened.
              key={`${sessionPath}\u0000${trimmedQuery}\u0000${[...kinds].sort().join(',')}`}
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
            style={{
              top: card.top,
              bottom: card.bottom,
              width: CARD_WIDTH_PX + CARD_INSET_PX,
            }}
            onMouseEnter={cancelCardHide}
            onMouseLeave={scheduleCardHide}
          >
            <div
              className="mr-3 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-[13px] leading-6 whitespace-pre-wrap text-foreground/85 shadow-lg"
              style={
                card.top !== undefined
                  ? { marginTop: CARD_GAP_PX, maxHeight: CARD_MAX_HEIGHT_PX }
                  : { marginBottom: CARD_GAP_PX, maxHeight: CARD_MAX_HEIGHT_PX }
              }
              data-testid="session-tree-preview"
            >
              {previewText === null ? (
                <span className="text-muted-foreground">Loading…</span>
              ) : previewText.text ? (
                <>
                  {previewText.text}
                  {previewText.truncated && (
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

/** Whether a tree is open right now: what the reader asked for, or the default. */
function isTreeExpanded(
  treeId: string,
  overrides: ReadonlyMap<string, boolean>,
  currentRootId: string | null | undefined,
): boolean {
  return overrides.get(treeId) ?? treeId === currentRootId;
}
