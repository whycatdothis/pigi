import { useCallback, useMemo, useRef } from 'react';

/** What history recall needs from the composer. */
export interface HistoryComposer {
  getText: () => string;
  /** Replace the composer text and put the caret at the end. */
  setText: (text: string) => void;
  /** Caret is collapsed on the first visual line. */
  isCaretOnFirstLine: () => boolean;
  /** Caret is collapsed on the last visual line. */
  isCaretOnLastLine: () => boolean;
}

interface InputHistoryResult {
  /** Exit recall mode and drop the saved draft. Call on send, session switch, programmatic restore. */
  reset: () => void;
  /** Call on user edits; keeps edited text as current draft. */
  handleTyping: () => void;
  /**
   * The text that should be persisted as the session draft: the composer text
   * when not recalling, otherwise the draft saved before recall started.
   */
  getDraftForSave: () => string;
  /**
   * Handle ArrowUp/ArrowDown for shell-style history recall. Returns true when
   * an entry was recalled; otherwise the key keeps its default caret movement.
   */
  handleArrowKey: (event: KeyboardEvent) => boolean;
}

export function useInputHistory(
  composer: HistoryComposer,
  userHistory: string[],
): InputHistoryResult {
  const historyIndexRef = useRef(-1);
  const savedDraftRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    historyIndexRef.current = -1;
    savedDraftRef.current = null;
  }, []);

  const handleTyping = useCallback(() => {
    if (historyIndexRef.current !== -1) {
      savedDraftRef.current = composer.getText();
      historyIndexRef.current = -1;
    }
  }, [composer]);

  const getDraftForSave = useCallback((): string => {
    if (historyIndexRef.current === -1) return composer.getText();
    return savedDraftRef.current ?? '';
  }, [composer]);

  const applyHistoryEntry = useCallback(
    (index: number) => {
      const text = index === -1 ? (savedDraftRef.current ?? '') : (userHistory[index] ?? '');
      composer.setText(text);
    },
    [composer, userHistory],
  );

  const handleArrowKey = useCallback(
    (event: KeyboardEvent): boolean => {
      const noModifiers = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
      if (!noModifiers || userHistory.length === 0) return false;

      if (event.key === 'ArrowUp') {
        if (!composer.isCaretOnFirstLine()) return false;
        // Keep the position valid if history shrank
        const currentIndex = Math.min(historyIndexRef.current, userHistory.length - 1);
        let nextIndex: number;
        if (currentIndex === -1) {
          // Save whatever is currently typed so down arrow can restore it
          savedDraftRef.current = composer.getText();
          nextIndex = userHistory.length - 1;
        } else if (currentIndex > 0) {
          nextIndex = currentIndex - 1;
        } else {
          // Already at the oldest entry
          return false;
        }
        historyIndexRef.current = nextIndex;
        applyHistoryEntry(nextIndex);
        return true;
      }

      if (event.key === 'ArrowDown') {
        if (historyIndexRef.current === -1 || !composer.isCaretOnLastLine()) return false;
        const currentIndex = Math.min(historyIndexRef.current, userHistory.length - 1);
        // At the newest entry, pressing down restores the saved draft
        historyIndexRef.current = currentIndex === userHistory.length - 1 ? -1 : currentIndex + 1;
        applyHistoryEntry(historyIndexRef.current);
        return true;
      }

      return false;
    },
    [composer, userHistory, applyHistoryEntry],
  );

  return useMemo(
    () => ({ reset, handleTyping, getDraftForSave, handleArrowKey }),
    [reset, handleTyping, getDraftForSave, handleArrowKey],
  );
}
