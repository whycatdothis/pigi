import { createContext, useContext } from 'react';
import type { TranscriptNode } from '../../state/transcriptController';

/**
 * Session tree / fork actions for message rows.
 *
 * The transcript renders through several layers (message list → virtual rows →
 * bubbles, plus the minimal view), so the actions are provided once at the app
 * level instead of being threaded through every row. The value must be stable;
 * App memoizes it.
 */
export interface MessageActions {
  /** Move the session position to this message. Null when unavailable. */
  onTree: ((node: TranscriptNode) => void) | null;
  /** Continue in a new session from this message. Null when unavailable. */
  onFork: ((node: TranscriptNode) => void) | null;
  /** Non-null while the actions exist but cannot run (compacting, summarizing). */
  disabledReason: string | null;
}

export const MessageActionsContext = createContext<MessageActions>({
  onTree: null,
  onFork: null,
  disabledReason: null,
});

export function useMessageActions(): MessageActions {
  return useContext(MessageActionsContext);
}
