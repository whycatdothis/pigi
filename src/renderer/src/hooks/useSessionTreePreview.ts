import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EntryTextResult, SessionTreeEntry } from '../../../shared/ipcContract';
import { getEntryText } from '../services/piAgentClient';
import { CARD_MAX_HEIGHT_PX, ROW_HEIGHT_PX } from '../components/sessionTree/sessionTreeGeometry';

/** Delay before the card goes away once the pointer leaves the row. */
const HIDE_DELAY_MS = 140;
/**
 * How long the pointer has to rest on a row before the card appears.
 *
 * Sweeping across the list is how a row gets found, and a card that arrives the
 * moment a row is entered flickers through every row on the way — each one
 * reading its text. Half a second is long enough to mean "this one".
 */
const CARD_SHOW_DELAY_MS = 500;
/**
 * Wait before reading a row's text.
 *
 * Short on purpose: the card waits much longer than this to appear, so the text
 * is usually there when it does, and a row the pointer only crossed is read once
 * and then sits in the cache.
 */
const TEXT_FETCH_DELAY_MS = 100;

export interface SessionTreeCardState {
  entryId: string;
  /** Anchored below the row when there is room, otherwise above it. */
  top?: number;
  bottom?: number;
}

interface UseSessionTreePreviewOptions {
  sessionPath: string;
  /** The dialog, so rows can be measured against its own top edge. */
  dialogRef: React.RefObject<HTMLDivElement | null>;
}

interface SessionTreePreview {
  card: SessionTreeCardState | null;
  /** The text of the card's row; null while it is still being read. */
  previewText: EntryTextResult | null;
  handleRowEnter: (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntry) => void;
  /** The pointer is on the card: keep it open. */
  cancelCardHide: () => void;
  /** The pointer left a row: close it, after the grace period. */
  scheduleCardHide: () => void;
  /** Forget the card and anything pending, e.g. when the dialog closes. */
  resetPreview: () => void;
}

/** The text of one entry, held with the row it belongs to. */
interface SessionTreePreviewText {
  entryId: string;
  text: EntryTextResult;
}

/**
 * The hover preview card: which row has one, where it sits and what it says.
 *
 * The card exists to show what the row had to cut off, so a row whose text fits
 * gets none — and it hangs off the row's own edge rather than below it, which is
 * what lets the pointer travel sideways into it without crossing a row in
 * between. It appears once the pointer has rested on a row, not when it is
 * entered, and its text is read once per entry and cached.
 */
export function useSessionTreePreview({
  sessionPath,
  dialogRef,
}: UseSessionTreePreviewOptions): SessionTreePreview {
  const [card, setCard] = useState<SessionTreeCardState | null>(null);
  const [preview, setPreview] = useState<SessionTreePreviewText | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Entry the card currently shows; null when no card is up. */
  const cardEntryIdRef = useRef<string | null>(null);
  const textCacheRef = useRef(new Map<string, EntryTextResult>());
  const hoveredEntryIdRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
    },
    [],
  );

  // Entry ids are unique per session, and the hook outlives the dialog, so the
  // cache is dropped when a different session takes over.
  useEffect(() => {
    textCacheRef.current.clear();
  }, [sessionPath]);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  // Entering the card keeps it: the pointer reached it, whatever it was doing.
  const cancelCardHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    clearShowTimer();
  }, [clearShowTimer]);

  /** Drop the card and any pending preview read (a row with nothing to preview). */
  const cancelHover = useCallback(() => {
    hoveredEntryIdRef.current = null;
    cardEntryIdRef.current = null;
    clearShowTimer();
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    setCard(null);
    setPreview(null);
  }, [clearShowTimer]);

  const resetPreview = useCallback(() => {
    cancelCardHide();
    cancelHover();
  }, [cancelCardHide, cancelHover]);

  /**
   * Read the row's text into the cache, once. Nothing is shown by this: the card
   * takes its text when it opens, and a read that lands while a card is up for
   * that row fills it in. A card that is up for another row keeps its own text —
   * the pointer leaving a row is not a reason for the text under it to go blank.
   */
  const readRowText = useCallback(
    (entryId: string) => {
      if (textCacheRef.current.has(entryId)) return;
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
      textTimerRef.current = setTimeout(() => {
        textTimerRef.current = null;
        void (async () => {
          const result = await getEntryText(sessionPath, entryId).catch(
            (): EntryTextResult => ({ success: false, text: '', truncated: false }),
          );
          textCacheRef.current.set(entryId, result);
          if (cardEntryIdRef.current === entryId) setPreview({ entryId, text: result });
        })();
      }, TEXT_FETCH_DELAY_MS);
    },
    [sessionPath],
  );

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntry) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      hoveredEntryIdRef.current = entry.id;
      const dialogRect = dialogRef.current?.getBoundingClientRect();
      if (!dialogRect) return;
      const rowTop = event.currentTarget.getBoundingClientRect().top - dialogRect.top;
      const rowBottom = rowTop + ROW_HEIGHT_PX;
      // The card exists to show what the row had to cut off. When the whole row
      // fits, showing it would only repeat what the user is already looking at.
      const rowText = event.currentTarget.querySelector<HTMLElement>('[data-tree-row-text]');
      const rowTextFits = rowText !== null && rowText.scrollWidth <= rowText.clientWidth + 1;

      // Start the read while the pointer is still resting: by the time the card
      // is allowed to appear, the text is usually there.
      readRowText(entry.id);

      // The card is already on this row (the pointer left it and came back).
      if (cardEntryIdRef.current === entry.id) return;
      clearShowTimer();
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        if (hoveredEntryIdRef.current !== entry.id) return;
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
        // Usually in the cache already: the read started while the pointer waited.
        const text = textCacheRef.current.get(entry.id);
        setPreview(text === undefined ? null : { entryId: entry.id, text });
      }, CARD_SHOW_DELAY_MS);
    },
    [cancelHover, clearShowTimer, dialogRef, readRowText],
  );

  const scheduleCardHide = useCallback(() => {
    hoveredEntryIdRef.current = null;
    clearShowTimer();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      cardEntryIdRef.current = null;
      setCard(null);
    }, HIDE_DELAY_MS);
  }, [clearShowTimer]);

  return {
    card,
    // Text of another row is not shown: the card says "Loading…" until its own
    // read lands, rather than showing what the last row said.
    previewText: card !== null && preview?.entryId === card.entryId ? preview.text : null,
    handleRowEnter,
    cancelCardHide,
    scheduleCardHide,
    resetPreview,
  };
}
