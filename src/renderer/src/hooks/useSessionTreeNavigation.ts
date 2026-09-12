/**
 * Session tree navigation: the `tree` and `fork` actions on a message row, the
 * leave-branch question, and the move itself.
 *
 * All of it writes to sessions the caller is not the owner of — the transcript
 * is replaced under the reader, the input box is filled, and a fork switches to
 * another session — so App.tsx passes in the few things only it owns (its
 * scroll handle, the input setter, the resume flow) and this hook keeps the
 * rest: which session is being read, whether a move is in flight, and the state
 * the dialogs render from.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  abortBranchSummary,
  createSession,
  forkSession,
  getMessages,
  getSessionTree,
  listProjectSessions,
  navigateSessionTree,
  setModel,
  setThinkingLevel,
} from '../services/piAgentClient';
import { useAppStore } from '../state/appStore';
import { ensureTranscriptSession } from './useTranscript';
import { countAbandonedEntries, resolveEntryId } from '../lib/sessionTreeLayout';
import type { MessageListHandle } from '../components/transcript/MessageList';
import type { TranscriptNode } from '../state/transcriptController';
import type { PiSessionInfo, SessionTreeDto } from '../../../shared/ipcContract';

interface SessionTreeNavigationOptions {
  /** The session the transcript shows; null in the draft chat. */
  activeSessionPath: string | null;
  /** Working directory a new session is created in (a fork with no history). */
  activeCwd: string;
  /** The transcript is streaming: it has to stop before the session can move. */
  busy: boolean;
  /** Compaction is in flight; a move would race it. */
  compacting: boolean;
  /**
   * A branch summary is running. It owns the session's turn, so the app's own
   * abort path (Esc, Stop) has to be able to see it; the move sets it.
   */
  branchSummaryBusy: boolean;
  setBranchSummaryBusy: (busy: boolean) => void;
  /** The session is still spawning its process, so it cannot be read or moved. */
  isSessionStarting: (sessionPath: string) => boolean;
  /** Stops the running turn, because the SDK rejects a move during one. */
  abortTurn: () => Promise<void>;
  /** Shows a session this flow created (a fork) and gives it a process. */
  resumeSession: (
    session: PiSessionInfo,
    options?: { skipHistory?: boolean; prefillText?: string; freshSession?: boolean },
  ) => Promise<void>;
  /** Puts text back into the input box (a branch summary, a forked message). */
  setRestoreText: (text: string) => void;
  /** Re-reads model and context usage after a move. */
  refreshSessionState: (sessionPath: string) => void;
  messageListRef: React.RefObject<MessageListHandle | null>;
}

interface SessionTreeNavigation {
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  helpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  /** Opener shared through the tree's context (the `?` buttons). */
  help: { openHelp: () => void };
  /** The leave-branch question, or null when nothing is being asked. */
  summaryPrompt: { entryId: string; abandonedCount: number } | null;
  /** True while the abandoned branch is being summarized. */
  branchSummaryBusy: boolean;
  /** Why the tree actions are disabled, or null when they work. */
  disabledReason: string | null;
  onTreeMessage: (node: TranscriptNode) => Promise<void>;
  onForkMessage: (node: TranscriptNode) => Promise<void>;
  onSelect: (entryId: string) => Promise<void>;
  onSummaryConfirm: (options: { summarize: boolean }) => void;
  onSummaryCancel: () => void;
}

/**
 * Wait (bounded) for the transcript to settle after an abort.
 *
 * Tree navigation reads the session file to count abandoned entries; running
 * it before the aborted assistant message is appended would count against a
 * stale leaf.
 */
async function waitForTranscriptIdle(sessionPath: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (ensureTranscriptSession(sessionPath).state.status === 'idle') return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

export function useSessionTreeNavigation({
  activeSessionPath,
  activeCwd,
  busy,
  compacting,
  branchSummaryBusy,
  setBranchSummaryBusy,
  isSessionStarting,
  abortTurn,
  resumeSession,
  setRestoreText,
  refreshSessionState,
  messageListRef,
}: SessionTreeNavigationOptions): SessionTreeNavigation {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [summaryPrompt, setSummaryPrompt] = useState<{
    entryId: string;
    abandonedCount: number;
  } | null>(null);
  // One move at a time: a second pick while the first is still running would
  // race it for the same session.
  const moveInFlightRef = useRef(false);

  const runTreeNavigation = useCallback(
    async (
      sessionPath: string,
      entryId: string,
      options: { summarize: boolean; customInstructions?: string },
    ): Promise<void> => {
      if (moveInFlightRef.current) return;
      moveInFlightRef.current = true;
      if (options.summarize) setBranchSummaryBusy(true);
      const summarizingToast = options.summarize
        ? toast.loading('Summarizing the abandoned branch…', {
            action: {
              label: 'Cancel',
              onClick: () => {
                void abortBranchSummary(sessionPath);
              },
            },
          })
        : null;

      try {
        // Hold the scroll while the old transcript is still on screen, then
        // follow the replacement: the reader lands at the end of the branch
        // they moved to, which is where the session now continues from.
        messageListRef.current?.suspendAutoScroll();
        const result = await navigateSessionTree(sessionPath, entryId, options);
        if (result.cancelled) {
          // The move did not happen, so give back the follow it suspended.
          messageListRef.current?.restoreFollow();
          return;
        }
        if (!result.success) {
          messageListRef.current?.restoreFollow();
          toast.error(result.error || 'Failed to move the session');
          return;
        }
        const controller = ensureTranscriptSession(sessionPath);
        controller.reset();
        const { messages, compactionCount } = await getMessages(sessionPath);
        controller.hydrate(messages, compactionCount);
        messageListRef.current?.scrollToBottom();
        if (result.editorText) {
          setRestoreText(result.editorText);
        }
        void refreshSessionState(sessionPath);
      } catch (error) {
        messageListRef.current?.restoreFollow();
        toast.error(error instanceof Error ? error.message : 'Failed to move the session');
      } finally {
        moveInFlightRef.current = false;
        if (options.summarize) setBranchSummaryBusy(false);
        if (summarizingToast !== null) toast.dismiss(summarizingToast);
      }
    },
    [messageListRef, refreshSessionState, setBranchSummaryBusy, setRestoreText],
  );

  /**
   * Shared preconditions for any tree navigation: the caller must be able to
   * write to the session (no pending process, no compaction) and the current
   * response has to stop first, because navigation during a turn is rejected by
   * the SDK. Aborting also returns queued messages to the input box.
   */
  const prepareTreeNavigation = useCallback(async (): Promise<string | null> => {
    const sessionPath = activeSessionPath;
    if (!sessionPath) return null;
    if (isSessionStarting(sessionPath)) {
      toast.error('The session is still starting');
      return null;
    }
    if (compacting) {
      toast.error('Wait for compaction to finish');
      return null;
    }
    if (busy) {
      await abortTurn();
      await waitForTranscriptIdle(sessionPath);
    }
    return sessionPath;
  }, [abortTurn, activeSessionPath, busy, compacting, isSessionStarting]);

  /** Ask about summarizing, then navigate. */
  const continueTreeNavigation = useCallback(
    async (sessionPath: string, tree: SessionTreeDto, entryId: string): Promise<void> => {
      if (entryId === tree.leafId) return;
      const abandonedCount = countAbandonedEntries(tree, entryId);
      if (abandonedCount > 0) {
        setSummaryPrompt({ entryId, abandonedCount });
        return;
      }
      await runTreeNavigation(sessionPath, entryId, { summarize: false });
    },
    [runTreeNavigation],
  );

  /** `tree` on a transcript row. */
  const handleTreeMessage = useCallback(
    async (node: TranscriptNode): Promise<void> => {
      const sessionPath = await prepareTreeNavigation();
      if (!sessionPath) return;
      try {
        const tree = await getSessionTree(sessionPath);
        const entryId = resolveEntryId(tree, node);
        if (!entryId) {
          toast.error('Could not find this message in the session tree');
          return;
        }
        await continueTreeNavigation(sessionPath, tree, entryId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to read the session tree');
      }
    },
    [continueTreeNavigation, prepareTreeNavigation],
  );

  /** A pick in the tree dialog. The tree is re-read because the dialog's copy
   *  was fetched when it opened. */
  const handleTreeSelect = useCallback(
    async (entryId: string): Promise<void> => {
      const sessionPath = await prepareTreeNavigation();
      if (!sessionPath) return;
      try {
        const tree = await getSessionTree(sessionPath);
        // The dialog only closes once the move is decided. A pick that needs the
        // summary question keeps it open: the question opens on top of it, and
        // cancelling the question returns the user to the list they were reading.
        const asksToSummarize = entryId !== tree.leafId && countAbandonedEntries(tree, entryId) > 0;
        if (!asksToSummarize) setDialogOpen(false);
        await continueTreeNavigation(sessionPath, tree, entryId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to read the session tree');
      }
    },
    [continueTreeNavigation, prepareTreeNavigation],
  );

  /** `fork` on a transcript row: copy the conversation into a new session. */
  const handleForkMessage = useCallback(
    async (node: TranscriptNode): Promise<void> => {
      if (moveInFlightRef.current) return;
      const sessionPath = await prepareTreeNavigation();
      if (!sessionPath) return;
      moveInFlightRef.current = true;
      try {
        const store = useAppStore.getState();
        const parent = store.sessions.get(sessionPath);
        const cwd = parent?.cwd ?? activeCwd;
        const tree = await getSessionTree(sessionPath);
        const entryId = resolveEntryId(tree, node);
        if (!entryId) {
          toast.error('Could not find this message in the session tree');
          return;
        }
        // A user message is left behind for the new chat to send again; an
        // answer or a tool result stays in the forked history.
        const position = node.role === 'user' ? 'before' : 'at';
        const result = await forkSession(sessionPath, entryId, position);
        if (!result.success) {
          toast.error(result.error || 'Failed to continue in a new chat');
          return;
        }

        const newPath = result.sessionPath ?? (await createSession(cwd, sessionPath));
        if (!result.sessionPath) {
          // A fork of the first message has no history to copy: the new chat
          // starts empty, so it needs the model this one is using.
          const model = parent?.model;
          if (model) {
            void setModel(newPath, model.provider, model.id).catch(() => {});
          }
          if (parent?.thinkingLevel) {
            void setThinkingLevel(newPath, parent.thinkingLevel).catch(() => {});
          }
        }

        await resumeSession(
          {
            path: newPath,
            id: '',
            cwd,
            parentSessionPath: sessionPath,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            messageCount: 0,
            firstMessage: parent?.title ?? 'New chat',
            allMessagesText: parent?.title ?? 'New chat',
          },
          { prefillText: result.selectedText, freshSession: !result.sessionPath },
        );
        // The fork is a file the sidebar has not listed yet: refresh so it
        // appears under this session instead of as a loose "New chat".
        void listProjectSessions([cwd]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to continue in a new chat');
      } finally {
        moveInFlightRef.current = false;
      }
    },
    [activeCwd, prepareTreeNavigation, resumeSession],
  );

  const handleSummaryPromptConfirm = useCallback(
    (options: { summarize: boolean }): void => {
      const prompt = summaryPrompt;
      const sessionPath = activeSessionPath;
      setSummaryPrompt(null);
      // The question is answered: the move goes ahead, so the tree the user was
      // browsing has done its job.
      setDialogOpen(false);
      if (!prompt || !sessionPath) return;
      void runTreeNavigation(sessionPath, prompt.entryId, options);
    },
    [activeSessionPath, runTreeNavigation, summaryPrompt],
  );

  /** Closing the prompt without answering drops the move, not the tree. */
  const handleSummaryPromptCancel = useCallback((): void => {
    setSummaryPrompt(null);
  }, []);

  const help = useMemo(() => ({ openHelp: () => setHelpOpen(true) }), []);

  const disabledReason = branchSummaryBusy
    ? 'Busy summarizing the abandoned branch'
    : compacting
      ? 'Wait for compaction to finish'
      : null;

  return {
    dialogOpen,
    onDialogOpenChange: setDialogOpen,
    helpOpen,
    onHelpOpenChange: setHelpOpen,
    help,
    summaryPrompt,
    branchSummaryBusy,
    disabledReason,
    onTreeMessage: handleTreeMessage,
    onForkMessage: handleForkMessage,
    onSelect: handleTreeSelect,
    onSummaryConfirm: handleSummaryPromptConfirm,
    onSummaryCancel: handleSummaryPromptCancel,
  };
}
