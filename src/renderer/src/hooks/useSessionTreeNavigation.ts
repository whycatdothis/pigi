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
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { countAbandonedEntries, isCurrentPosition, resolveEntryId } from '../lib/sessionTreeLayout';
import type { MessageListHandle } from '../components/transcript/MessageList';
import type { TranscriptNode } from '../state/transcriptController';
import type { PiSessionInfo, PromptInput, SessionTree } from '../../../shared/ipcContract';

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
    options?: { skipHistory?: boolean; prefillInput?: PromptInput; freshSession?: boolean },
  ) => Promise<void>;
  /** Puts a message taken off the branch back into the input box. */
  setRestoreInput: (input: PromptInput) => void;
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
  onEditMessage: (node: TranscriptNode) => Promise<void>;
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
function waitForTranscriptIdle(sessionPath: string, timeoutMs = 2000): Promise<void> {
  const controller = ensureTranscriptSession(sessionPath);
  if (controller.state.status === 'idle') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    const unsubscribe = controller.subscribe(() => {
      if (controller.state.status === 'idle') finish();
    });
  });
}

/** Attachments a restored message lost: they were sent as a status line only. */
function warnDroppedFiles(fileNames: string[] | undefined): void {
  if (!fileNames || fileNames.length === 0) return;
  toast.warning(`Not restored (sent without content): ${fileNames.join(', ')}`);
}

export function useSessionTreeNavigation(
  options: SessionTreeNavigationOptions,
): SessionTreeNavigation {
  const { activeSessionPath, branchSummaryBusy, compacting } = options;
  // The actions read the options at the time they run, not at the render that
  // created them: they stay stable, so the message toolbars that receive them
  // do not re-render every time the transcript changes status.
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
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
      const { messageListRef, refreshSessionState, setBranchSummaryBusy, setRestoreInput } =
        optionsRef.current;
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
        if (result.editorInput) {
          setRestoreInput(result.editorInput);
        }
        warnDroppedFiles(result.droppedFileNames);
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
    [],
  );

  /**
   * Shared preconditions for any tree navigation: the caller must be able to
   * write to the session (no pending process, no compaction) and the current
   * response has to stop first, because navigation during a turn is rejected by
   * the SDK. Aborting also returns queued messages to the input box.
   */
  const prepareTreeNavigation = useCallback(async (): Promise<string | null> => {
    const {
      activeSessionPath: sessionPath,
      isSessionStarting,
      compacting,
      busy,
      abortTurn,
    } = optionsRef.current;
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
  }, []);

  /**
   * Ask about summarizing, or navigate. Returns the move, or null when the
   * question was asked instead and nothing moves until it is answered.
   */
  const continueTreeNavigation = useCallback(
    (sessionPath: string, tree: SessionTree, entryId: string): Promise<void> | null => {
      if (isCurrentPosition(tree, entryId)) return Promise.resolve();
      const abandonedCount = countAbandonedEntries(tree, entryId);
      if (abandonedCount > 0) {
        setSummaryPrompt({ entryId, abandonedCount });
        return null;
      }
      return runTreeNavigation(sessionPath, entryId, { summarize: false });
    },
    [runTreeNavigation],
  );

  /**
   * Prepares the session and finds a transcript row's tree entry. Null when the
   * move cannot go ahead; the reason has been shown.
   */
  const resolveNodeTarget = useCallback(
    async (
      node: TranscriptNode,
    ): Promise<{ sessionPath: string; tree: SessionTree; entryId: string } | null> => {
      const sessionPath = await prepareTreeNavigation();
      if (!sessionPath) return null;
      const tree = await getSessionTree(sessionPath);
      const entryId = resolveEntryId(tree, node);
      if (!entryId) {
        toast.error('Could not find this message in the session tree');
        return null;
      }
      return { sessionPath, tree, entryId };
    },
    [prepareTreeNavigation],
  );

  /** `tree` on a transcript row. */
  const handleTreeMessage = useCallback(
    async (node: TranscriptNode): Promise<void> => {
      try {
        const target = await resolveNodeTarget(node);
        if (!target) return;
        await continueTreeNavigation(target.sessionPath, target.tree, target.entryId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to read the session tree');
      }
    },
    [continueTreeNavigation, resolveNodeTarget],
  );

  /**
   * `edit` on a user message: a tree move to it with the summary
   * question answered "no". The message goes back to the input box.
   */
  const handleEditMessage = useCallback(
    async (node: TranscriptNode): Promise<void> => {
      try {
        const target = await resolveNodeTarget(node);
        if (!target) return;
        // A message with nothing after it would silently stay put.
        if (isCurrentPosition(target.tree, target.entryId)) {
          toast.error('This message has no reply to leave yet');
          return;
        }
        await runTreeNavigation(target.sessionPath, target.entryId, { summarize: false });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to read the session tree');
      }
    },
    [resolveNodeTarget, runTreeNavigation],
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
        const move = continueTreeNavigation(sessionPath, tree, entryId);
        if (move === null) return;
        setDialogOpen(false);
        await move;
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
      // Taken before the abort is awaited: a second click during it must not
      // start a second fork.
      moveInFlightRef.current = true;
      try {
        const target = await resolveNodeTarget(node);
        if (!target) return;
        const { sessionPath, entryId } = target;
        const { activeCwd, resumeSession } = optionsRef.current;
        const store = useAppStore.getState();
        const parent = store.sessions.get(sessionPath);
        const cwd = parent?.cwd ?? activeCwd;
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
          { prefillInput: result.editorInput, freshSession: !result.sessionPath },
        );
        warnDroppedFiles(result.droppedFileNames);
        // The fork is a file the sidebar has not listed yet: refresh so it
        // appears under this session instead of as a loose "New chat".
        void listProjectSessions([cwd]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to continue in a new chat');
      } finally {
        moveInFlightRef.current = false;
      }
    },
    [resolveNodeTarget],
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
    onEditMessage: handleEditMessage,
    onSelect: handleTreeSelect,
    onSummaryConfirm: handleSummaryPromptConfirm,
    onSummaryCancel: handleSummaryPromptCancel,
  };
}
