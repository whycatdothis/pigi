import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EntryTextResult, SessionTreeEntry } from '../../../shared/ipcContract';
import { getEntryText } from '../services/piAgentClient';
import { CARD_MAX_HEIGHT_PX, ROW_HEIGHT_PX } from '../components/sessionTree/sessionTreeGeometry';

/** Delay before the card goes away once the pointer leaves the row. */
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
/** Wait before reading the text of the row the pointer settled on. */
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

/**
 * The hover preview card: which row has one, where it sits and what it says.
 *
 * The card exists to show what the row had to cut off, so a row whose text fits
 * gets none — and it hangs off the row's own edge rather than below it, which is
 * what lets the pointer travel sideways into it without crossing a row in
 * between. Rows are measured against the dialog, and the text is read once per
 * entry and cached.
 */
export function useSessionTreePreview({
  sessionPath,
  dialogRef,
}: UseSessionTreePreviewOptions): SessionTreePreview {
  const [card, setCard] = useState<SessionTreeCardState | null>(null);
  const [previewText, setPreviewText] = useState<EntryTextResult | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Entry the card currently shows; null when no card is up. */
  const cardEntryIdRef = useRef<string | null>(null);
  const textCacheRef = useRef(new Map<string, EntryTextResult>());
  const hoveredEntryIdRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
    },
    [],
  );

  // Entry ids are unique per session, and the hook outlives the dialog, so the
  // cache is dropped when a different session takes over.
  useEffect(() => {
    textCacheRef.current.clear();
  }, [sessionPath]);

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

  const resetPreview = useCallback(() => {
    cancelCardHide();
    cancelHover();
  }, [cancelCardHide, cancelHover]);

  const handleRowEnter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, entry: SessionTreeEntry) => {
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
    [cancelHover, clearSwitchTimer, dialogRef, sessionPath],
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

  return {
    card,
    previewText,
    handleRowEnter,
    cancelCardHide,
    scheduleCardHide,
    resetPreview,
  };
}
