import { useCallback, useMemo, useRef, type KeyboardEvent, type RefObject } from 'react';
import { resizeTextarea, getVisualLineInfo } from '../components/chatInput/textareaMeasure';

interface InputHistoryResult {
  /** Exit recall mode and drop the saved draft. Call on send, session switch, programmatic restore. */
  reset: () => void;
  /** Call from onInput before anything else; keeps edited text as current draft. */
  handleTyping: () => void;
  /**
   * The text that should be persisted as the session draft: the textarea value
   * when not recalling, otherwise the draft saved before recall started.
   */
  getDraftForSave: () => string;
  /**
   * Handle ArrowUp/ArrowDown for shell-style history recall.
   * Returns true if the event was consumed (caller should stop processing).
   *
   * Every unmodified ArrowUp/ArrowDown returns true — even early-return paths
   * where the key is a no-op — because in the original code those branches all
   * ended with `return`, preventing the Enter handler from running.
   */
  handleArrowKey: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

export function useInputHistory(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
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
      savedDraftRef.current = textareaRef.current?.value ?? '';
      historyIndexRef.current = -1;
    }
  }, [textareaRef]);

  const getDraftForSave = useCallback((): string => {
    const textarea = textareaRef.current;
    if (!textarea) return '';
    if (historyIndexRef.current === -1) return textarea.value;
    return savedDraftRef.current ?? '';
  }, [textareaRef]);

  const applyHistoryEntry = useCallback(
    (index: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const text = index === -1 ? (savedDraftRef.current ?? '') : (userHistory[index] ?? '');
      textarea.value = text;
      resizeTextarea(textarea);
      textarea.selectionStart = textarea.selectionEnd = text.length;
    },
    [textareaRef, userHistory],
  );

  const handleArrowKey = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const noModifiers = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;

      if (event.key === 'ArrowUp' && noModifiers) {
        if (userHistory.length === 0) return true;
        const textarea = textareaRef.current;
        // With an active selection the default collapse/caret behavior wins
        if (
          !textarea ||
          textarea.selectionStart !== textarea.selectionEnd ||
          getVisualLineInfo(textarea).caretLine > 0
        )
          return true;
        // Keep the position valid if history shrank
        historyIndexRef.current = Math.min(historyIndexRef.current, userHistory.length - 1);
        const currentIndex = historyIndexRef.current;
        let nextIndex: number;
        if (currentIndex === -1) {
          // Save whatever is currently typed so down arrow can restore it
          savedDraftRef.current = textarea.value;
          nextIndex = userHistory.length - 1;
        } else if (currentIndex > 0) {
          nextIndex = currentIndex - 1;
        } else {
          // Already at the oldest entry
          return true;
        }
        event.preventDefault();
        historyIndexRef.current = nextIndex;
        applyHistoryEntry(historyIndexRef.current);
        return true;
      }

      if (event.key === 'ArrowDown' && noModifiers) {
        if (userHistory.length === 0 || historyIndexRef.current === -1) return true;
        const textarea = textareaRef.current;
        if (!textarea || textarea.selectionStart !== textarea.selectionEnd) return true;
        const { caretLine, totalLines } = getVisualLineInfo(textarea);
        if (caretLine < totalLines - 1) return true;
        historyIndexRef.current = Math.min(historyIndexRef.current, userHistory.length - 1);
        event.preventDefault();
        // At the newest entry, pressing down restores the saved draft
        historyIndexRef.current =
          historyIndexRef.current === userHistory.length - 1 ? -1 : historyIndexRef.current + 1;
        applyHistoryEntry(historyIndexRef.current);
        return true;
      }

      return false;
    },
    [textareaRef, userHistory, applyHistoryEntry],
  );

  return useMemo(
    () => ({ reset, handleTyping, getDraftForSave, handleArrowKey }),
    [reset, handleTyping, getDraftForSave, handleArrowKey],
  );
}
