import {
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
  type DragEvent,
  type Ref,
} from 'react';
import { EditorContent, useEditor, type EditorOptions } from '@tiptap/react';
import { toast } from 'sonner';
import { IconArrowUp, IconGitBranch, IconSquare } from '@tabler/icons-react';
import type {
  ChatAttachmentKind,
  ModelInfo,
  ProjectDirectory,
  PromptInput,
  SkillSlashCommand,
  ThinkingLevel,
} from '../../../../shared/ipcContract';
import type { SessionEntry } from '../../state/appStore';
import { InputGroup, InputGroupAddon, InputGroupButton } from '../ui/input-group';
import { CHAT_INPUT_MAX_WIDTH } from '../../lib/layoutConstants';
import { cn } from '../../lib/utils';
import {
  getAllSlashCommands,
  matchSlashCommands,
  EMPTY_SLASH_MATCHES,
  type SlashCommand,
} from '../../lib/slashCommands';
import { escapeAbortScopeProps } from '../../lib/focusScopes';
import { NEW_CHAT_DRAFT_KEY, readChatDraft, writeChatDraft } from '../../lib/chatDrafts';
import {
  attachmentFromFile,
  attachmentFromPickedFile,
  attachmentFromPromptAttachment,
  MAX_PROMPT_ATTACHMENTS,
  type ChatAttachment,
} from '../../lib/chatAttachments';
import { useInputHistory, type HistoryComposer } from '../../hooks/useInputHistory';
import type { ChatReferenceKind } from '../../lib/chatReferences';
import {
  composerDocumentFromText,
  inlineContentFromText,
  REFERENCE_TRIGGERS,
} from '../../lib/composerContent';
import { formatContextUsage, UNKNOWN_STATUS } from './formatters';
import { ContextUsageTooltip } from './contextUsageTooltip';
import { ProjectPicker } from './projectPicker';
import { ModelSettingsPicker } from './modelSettingsPicker';
import { SlashCommandPopover } from './slashCommandPopover';
import { AttachmentChips, AttachmentPickerButton } from './attachmentPicker';
import { FileMentionPopover } from './fileMentionPopover';
import {
  COMPOSER_TEXT_START,
  createComposerExtensions,
  exitReferenceSuggestion,
  exitReferenceSuggestions,
  type ComposerSuggestion,
} from './composerExtensions';

export interface ChatInputHandle {
  focus: () => void;
}

interface ChatInputProps {
  ref?: Ref<ChatInputHandle>;
  onSend: (message: string, attachments: ChatAttachment[]) => void;
  onFollowUp: (message: string, attachments: ChatAttachment[]) => void;
  onAbort: () => void;
  onSlashCommand: (command: string, arg: string) => void;
  isStreaming: boolean;
  gitBranch: string | null;
  /** Messages handed back by abort/dequeue, restored before the current input. */
  restoreInputs: PromptInput[] | null;
  onRestoredInputs: () => void;
  onRefreshGitBranch: () => Promise<void>;
  session: SessionEntry | null;
  modelOptions: ModelInfo[];
  thinkingLevelOptions: ThinkingLevel[];
  skillOptions: SkillSlashCommand[];
  /** Past user prompts (most recent last) for up/down arrow recall */
  userHistory: string[];
  onSelectModel: (model: ModelInfo) => void;
  onSelectThinkingLevel: (thinkingLevel: ThinkingLevel) => void;
  /** Fire-and-forget refresh of the model catalog; called when the model picker is clicked. */
  onRequestModelRefresh: () => void;
  /** New session mode: centers input, enables project switching via # */
  isNewSession?: boolean;
  recentProjects?: ProjectDirectory[];
  activeProject?: ProjectDirectory | null;
  onSelectProject?: (path: string) => void;
}

const MODEL_FALLBACK = 'Model';
const THINKING_FALLBACK = 'Thinking';
const NEW_SESSION_PLACEHOLDER = 'Type # to quick change project.';
const FOLLOW_UP_PLACEHOLDER = 'Ask for follow-up changes';
const NEW_SESSION_HEADING = 'Here we go!';
const NO_COMMANDS: ReadonlySet<string> = new Set();
const EMPTY_FILE_MATCHES: string[] = [];
const TEXT_BLOCK_SEPARATOR = '\n';
/** Send and stop share one look so the button does not change colour mid-run. */
const PRIMARY_ACTION_CLASS_NAME =
  'rounded-full bg-[var(--system-accent)] text-white hover:bg-[var(--system-accent)]';

/** Editor callbacks that need the latest render's state. */
interface ComposerHandlers {
  keyDown: (event: KeyboardEvent) => boolean;
  paste: (event: ClipboardEvent) => boolean;
  drop: (event: globalThis.DragEvent) => boolean;
}

export default function ChatInput({
  ref,
  onSend,
  onFollowUp,
  onAbort,
  onSlashCommand,
  isStreaming,
  gitBranch,
  restoreInputs,
  onRestoredInputs,
  onRefreshGitBranch,
  session,
  modelOptions,
  thinkingLevelOptions,
  onSelectModel,
  onSelectThinkingLevel,
  onRequestModelRefresh,
  skillOptions,
  userHistory,
  isNewSession = false,
  recentProjects = [],
  activeProject = null,
  onSelectProject,
}: ChatInputProps): React.JSX.Element {
  // Which input box currently owns the composer: the active session's path, or
  // NEW_CHAT_DRAFT_KEY while composing the first message of a new chat.
  const draftKey = session?.sessionPath || NEW_CHAT_DRAFT_KEY;
  const activeDraftKeyRef = useRef<string | null>(null);

  // The open `/` or `@` picker and the keyboard position inside it.
  const [suggestion, setSuggestion] = useState<ComposerSuggestion | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  // Latest `@` search result, tagged with the project and query it answers.
  const [mentionResult, setMentionResult] = useState<{
    cwd: string;
    query: string;
    files: string[];
    error: string | null;
  }>({ cwd: '', query: '', files: [], error: null });

  // Hash autocomplete state for project switching (#)
  const [hashMode, setHashMode] = useState(false);

  // Files and images attached to the next message. Kept in a ref alongside
  // state so async paste/picker handlers always see the latest list.
  const attachmentsRef = useRef<ChatAttachment[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // Commands that can appear as a chip. The utility merges extension commands
  // into `skillOptions`, so this covers both.
  const commandNames = useMemo(
    () => new Set(skillOptions.map((skill) => skill.name)),
    [skillOptions],
  );
  const commandNamesRef = useRef(commandNames);
  useLayoutEffect(() => {
    commandNamesRef.current = commandNames;
  }, [commandNames]);

  const handlersRef = useRef<ComposerHandlers>({
    keyDown: () => false,
    paste: () => false,
    drop: () => false,
  });

  const handleSuggestionChange = useCallback(
    (kind: ChatReferenceKind, next: ComposerSuggestion | null) => {
      setSuggestion((current) => next ?? (current?.kind === kind ? null : current));
      setSelectedSuggestionIndex(0);
    },
    [],
  );

  const [extensions] = useState(() =>
    createComposerExtensions({
      placeholder: isNewSession ? NEW_SESSION_PLACEHOLDER : FOLLOW_UP_PLACEHOLDER,
      onSuggestionChange: handleSuggestionChange,
    }),
  );
  const [editorProps] = useState<EditorOptions['editorProps']>(() => ({
    attributes: {
      class: cn(
        'chat-composer max-h-[17.5vh] overflow-y-auto px-4 pb-2 pt-4 text-sm leading-6 outline-none',
        // Attachments sit right under the text instead of below the empty min height.
        isNewSession ? 'min-h-24' : 'min-h-16',
        'in-data-has-attachments:min-h-0',
      ),
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Message',
      'data-testid': 'chat-composer',
    },
    handleKeyDown: (_view, event) => handlersRef.current.keyDown(event),
    handlePaste: (_view, event) => handlersRef.current.paste(event),
    // Claim the editor's drop so ProseMirror does not fall back to inserting a
    // `text/uri-list` file URL; the wrapper handles drops outside the editor.
    handleDrop: (_view, event) => handlersRef.current.drop(event),
  }));

  const editor = useEditor({
    extensions,
    editorProps,
    onUpdate: ({ editor: updatedEditor }) => {
      history.handleTyping();
      // Hash autocomplete detection (only in new session mode)
      if (isNewSession) {
        const { doc, selection } = updatedEditor.state;
        setHashMode(doc.textBetween(0, selection.from, TEXT_BLOCK_SEPARATOR) === '#');
      }
    },
    onBlur: ({ editor: blurredEditor }) => {
      // The file popover has no outside-click handling of its own.
      exitReferenceSuggestion(blurredEditor.view, 'file');
    },
  });

  useImperativeHandle(ref, () => ({ focus: () => editor.commands.focus() }), [editor]);

  const composer = useMemo<HistoryComposer>(
    () => ({
      getText: () => editor.getText({ blockSeparator: TEXT_BLOCK_SEPARATOR }),
      setText: (text) => {
        editor
          .chain()
          .setContent(composerDocumentFromText(text, commandNamesRef.current), {
            emitUpdate: false,
          })
          .focus('end')
          .run();
        exitReferenceSuggestions(editor.view);
      },
      isCaretOnFirstLine: () => {
        const { selection } = editor.state;
        return (
          selection.empty && selection.$from.index(0) === 0 && editor.view.endOfTextblock('up')
        );
      },
      isCaretOnLastLine: () => {
        const { selection, doc } = editor.state;
        return (
          selection.empty &&
          selection.$from.index(0) === doc.childCount - 1 &&
          editor.view.endOfTextblock('down')
        );
      },
    }),
    [editor],
  );

  const history = useInputHistory(composer, userHistory);
  // Stable references for effect deps; `history` itself changes with userHistory.
  const { reset: resetHistory, getDraftForSave: getHistoryDraft } = history;

  const setAttachmentList = useCallback((next: ChatAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      setAttachmentList(attachmentsRef.current.filter((attachment) => attachment.id !== id));
    },
    [setAttachmentList],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const remaining = MAX_PROMPT_ATTACHMENTS - attachmentsRef.current.length;
      if (remaining <= 0) {
        toast.error(`You can attach up to ${MAX_PROMPT_ATTACHMENTS} files per message.`);
        return;
      }
      if (files.length > remaining) {
        toast.error(`Only ${remaining} more attachment${remaining === 1 ? '' : 's'} allowed.`);
      }

      const built: ChatAttachment[] = [];
      for (const file of files.slice(0, remaining)) {
        let path = '';
        try {
          path = window.piApi.getPathForFile(file);
        } catch {
          path = '';
        }
        try {
          built.push(await attachmentFromFile(file, path));
        } catch (error) {
          console.error('Failed to attach file:', error);
          toast.error(
            error instanceof Error ? error.message : `Could not attach ${file.name || 'file'}.`,
          );
        }
      }
      if (built.length > 0) {
        setAttachmentList([...attachmentsRef.current, ...built]);
      }
    },
    [setAttachmentList],
  );

  const handlePickAttachments = useCallback(
    async (kind: ChatAttachmentKind) => {
      const remaining = MAX_PROMPT_ATTACHMENTS - attachmentsRef.current.length;
      if (remaining <= 0) {
        toast.error(`You can attach up to ${MAX_PROMPT_ATTACHMENTS} files per message.`);
        return;
      }
      const result = await window.piApi.pickAttachments(kind);
      if (!result.success) {
        if (!result.canceled) {
          toast.error(result.error ?? 'Could not open the file picker.');
        }
        return;
      }
      if (result.files.length > remaining) {
        toast.error(`Only ${remaining} more attachment${remaining === 1 ? '' : 's'} allowed.`);
      }
      setAttachmentList([
        ...attachmentsRef.current,
        ...result.files.slice(0, remaining).map(attachmentFromPickedFile),
      ]);
    },
    [setAttachmentList],
  );

  // Clipboard files become attachments; text is inserted as plain text with a
  // leading `/command` turned into a chip. Pasted `@` tokens stay text: in code
  // and shell commands they are rarely file references (`@Override`,
  // `npm i @types/node`).
  const handlePaste = useCallback(
    (event: ClipboardEvent): boolean => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        void addFiles(files);
        return true;
      }
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return false;
      const atPromptStart = editor.state.selection.from === COMPOSER_TEXT_START;
      editor
        .chain()
        .insertContent(
          inlineContentFromText(text, atPromptStart ? commandNames : NO_COMMANDS, {
            fileReferences: false,
          }),
        )
        .scrollIntoView()
        .run();
      return true;
    },
    [addFiles, editor, commandNames],
  );

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }, []);

  const addDroppedFiles = useCallback(
    (dataTransfer: DataTransfer | null): boolean => {
      const files = Array.from(dataTransfer?.files ?? []);
      if (files.length === 0) return false;
      dragDepthRef.current = 0;
      setIsDragOver(false);
      void addFiles(files);
      return true;
    },
    [addFiles],
  );

  const handleEditorDrop = useCallback(
    (event: globalThis.DragEvent): boolean => addDroppedFiles(event.dataTransfer),
    [addDroppedFiles],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      // The editor already claimed a drop on its own DOM (and prevented the
      // default), so the bubbled event must not attach the same files twice.
      if (event.defaultPrevented) return;
      if (!addDroppedFiles(event.dataTransfer)) return;
      event.preventDefault();
    },
    [addDroppedFiles],
  );

  const allSlashCommands = useMemo(() => getAllSlashCommands(skillOptions), [skillOptions]);

  const slashMatches = useMemo(
    () =>
      suggestion?.kind === 'skill'
        ? matchSlashCommands(`${REFERENCE_TRIGGERS.skill}${suggestion.query}`, allSlashCommands)
        : EMPTY_SLASH_MATCHES,
    [suggestion, allSlashCommands],
  );
  // Flat list for keyboard nav across builtin + skill groups
  const flatSlashMatches = useMemo(
    () => [...slashMatches.builtin, ...slashMatches.skill],
    [slashMatches],
  );

  const projectPath = session?.cwd ?? activeProject?.path ?? '';
  const mentionOpen = suggestion?.kind === 'file';
  const mentionQuery = mentionOpen ? suggestion.query.trim() : '';
  // While the next query is in flight, keep showing the previous results
  // instead of flashing an empty list on every keystroke.
  const mentionResultIsCurrent =
    mentionResult.cwd === projectPath && mentionResult.query === mentionQuery;
  const mentionMatches =
    mentionOpen && mentionResult.cwd === projectPath ? mentionResult.files : EMPTY_FILE_MATCHES;
  const mentionSearching =
    mentionResult.cwd !== projectPath || mentionResult.query !== mentionQuery;
  const mentionError = mentionOpen && mentionResultIsCurrent ? mentionResult.error : null;

  // An empty query lists the project's most recently modified files, and
  // warms the index on the first open. Search on every keystroke: fff answers
  // from the in-memory index, and the cancelled flag drops stale replies.
  useEffect(() => {
    if (!mentionOpen || projectPath.length === 0) return;
    let cancelled = false;
    void window.piApi
      .searchProjectFiles(projectPath, mentionQuery)
      .catch((error: unknown) => ({
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }))
      .then((result) => {
        if (cancelled) return;
        setMentionResult({
          cwd: projectPath,
          query: mentionQuery,
          files: result.success ? result.files : [],
          // A failed search must not look like an empty project.
          error: result.success ? null : result.error || 'File search is unavailable.',
        });
        setSelectedSuggestionIndex(0);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionOpen, mentionQuery, projectPath]);

  // Save/restore the draft of the input box being switched to/from. Drafts are
  // stored module-level (see lib/chatDrafts.ts) so text typed on the new-chat
  // screen survives the unmount that happens when the user opens a session.
  // Content is set outside the effect: chips are React node views, which
  // Tiptap renders with flushSync, and React forbids that during an effect.
  useEffect(() => {
    const previousKey = activeDraftKeyRef.current;

    // Save the previous key's draft (if navigating history, the saved draft is
    // what the user actually typed, not the recalled message currently shown)
    if (previousKey !== null && previousKey !== draftKey) {
      writeChatDraft(previousKey, getHistoryDraft());
    }

    // Reset history recall when switching sessions
    resetHistory();

    if (previousKey !== draftKey) {
      // Attachments belong to one draft/session; do not carry them across.
      setAttachmentList([]);
      // Restore the current key's draft and auto-focus the input
      const draft = readChatDraft(draftKey);
      queueMicrotask(() => composer.setText(draft));
    }

    activeDraftKeyRef.current = draftKey;
  }, [draftKey, resetHistory, getHistoryDraft, setAttachmentList, composer]);

  // The composer leaves the tree when switching between the new-chat screen
  // and a session; persist its draft. The editor itself is destroyed after
  // this cleanup, so its text is still readable here.
  useEffect(
    () => () => {
      const key = activeDraftKeyRef.current;
      if (key !== null) writeChatDraft(key, getHistoryDraft());
    },
    [getHistoryDraft],
  );

  // Restore messages from abort/dequeue
  useEffect(() => {
    if (restoreInputs === null) return;
    // Programmatic value change: exit history recall
    resetHistory();
    // Restored messages go before the current input
    const combined = [...restoreInputs.map((input) => input.message), composer.getText().trim()]
      .filter((text) => text)
      .join('\n\n');
    queueMicrotask(() => composer.setText(combined));
    const restoredAttachments = restoreInputs.flatMap((input) =>
      input.attachments.map(attachmentFromPromptAttachment),
    );
    if (restoredAttachments.length > 0) {
      const merged = [...restoredAttachments, ...attachmentsRef.current];
      if (merged.length > MAX_PROMPT_ATTACHMENTS) {
        toast.error(`Only the first ${MAX_PROMPT_ATTACHMENTS} attachments were kept.`);
      }
      setAttachmentList(merged.slice(0, MAX_PROMPT_ATTACHMENTS));
    }
    onRestoredInputs();
  }, [restoreInputs, onRestoredInputs, resetHistory, composer, setAttachmentList]);

  const contextUsage = session?.contextUsage ?? null;
  const autoCompactionEnabled = session?.autoCompactionEnabled ?? false;
  const contextUsageLabel = formatContextUsage(contextUsage, autoCompactionEnabled);
  const modelLabel = session?.model?.name ?? MODEL_FALLBACK;
  const rawThinkingLevel = session?.thinkingLevel ?? null;
  const thinkingValue = rawThinkingLevel;
  const thinkingLabel = rawThinkingLevel ?? THINKING_FALLBACK;

  const clearInput = useCallback(() => {
    editor.commands.clearContent();
  }, [editor]);

  const insertSlashCommand = useCallback(
    (command: SlashCommand) => {
      if (!suggestion) return;
      if (command.source === 'skill') {
        suggestion.insertReference(command.name);
        return;
      }
      editor
        .chain()
        .focus()
        .insertContentAt(suggestion.range, `${REFERENCE_TRIGGERS.skill}${command.name} `)
        .run();
    },
    [editor, suggestion],
  );

  const handleSend = useCallback(() => {
    const text = composer.getText().trim();
    const pendingAttachments = attachmentsRef.current;
    if (!text && pendingAttachments.length === 0) return;
    // Sending exits history recall; the sent message enters the transcript
    history.reset();

    // Check for slash command (only if it matches a known command)
    if (text.startsWith('/') && pendingAttachments.length === 0) {
      const spaceIndex = text.indexOf(' ');
      const name = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
      const arg = spaceIndex === -1 ? '' : text.slice(spaceIndex + 1).trim();

      const builtinMatch = allSlashCommands.find((c) => c.source === 'builtin' && c.name === name);
      if (builtinMatch) {
        clearInput();
        onSlashCommand(name, arg);
        return;
      }

      // Skills and unknown commands are sent as a regular prompt; the SDK
      // expands skills.
    }

    clearInput();
    setAttachmentList([]);
    onSend(text, pendingAttachments);
  }, [composer, onSend, onSlashCommand, allSlashCommands, history, clearInput, setAttachmentList]);

  const handleFollowUpSend = useCallback(() => {
    const text = composer.getText().trim();
    const pendingAttachments = attachmentsRef.current;
    if (!text && pendingAttachments.length === 0) return;
    history.reset();
    clearInput();
    setAttachmentList([]);
    onFollowUp(text, pendingAttachments);
  }, [composer, onFollowUp, history, clearInput, setAttachmentList]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (event.isComposing || event.key === 'Process') return false;

      // Picker navigation takes priority over history and the send shortcut.
      // Escape is left to the suggestion plugin, which closes the picker.
      const matchCount =
        suggestion?.kind === 'file' ? mentionMatches.length : flatSlashMatches.length;
      if (suggestion && matchCount > 0) {
        if (event.key === 'ArrowUp') {
          setSelectedSuggestionIndex((index) => (index - 1 + matchCount) % matchCount);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedSuggestionIndex((index) => (index + 1) % matchCount);
          return true;
        }
        if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
          if (suggestion.kind === 'file') {
            const selectedPath = mentionMatches[selectedSuggestionIndex];
            if (selectedPath) suggestion.insertReference(selectedPath);
            return true;
          }
          const selectedCommand = flatSlashMatches[selectedSuggestionIndex];
          if (selectedCommand) {
            if (selectedCommand.source === 'builtin' && !selectedCommand.hasArg) {
              // Builtin no-arg: execute immediately (e.g., /compact, /new)
              clearInput();
              onSlashCommand(selectedCommand.name, '');
            } else {
              insertSlashCommand(selectedCommand);
            }
          }
          return true;
        }
      }

      // Shell-style history recall
      if (history.handleArrowKey(event)) return true;

      if (event.key === 'Enter' && !event.shiftKey) {
        if (event.altKey && isStreaming) {
          handleFollowUpSend();
        } else {
          handleSend();
        }
        return true;
      }
      return false;
    },
    [
      handleSend,
      handleFollowUpSend,
      isStreaming,
      suggestion,
      mentionMatches,
      flatSlashMatches,
      selectedSuggestionIndex,
      onSlashCommand,
      history,
      clearInput,
      insertSlashCommand,
    ],
  );

  useLayoutEffect(() => {
    handlersRef.current = { keyDown: handleKeyDown, paste: handlePaste, drop: handleEditorDrop };
  }, [handleKeyDown, handlePaste, handleEditorDrop]);

  const projectLabel = activeProject?.name ?? 'select project';

  return (
    <div
      className={cn(
        'relative',
        !isNewSession && 'z-10 shrink-0 px-5',
        isNewSession && 'flex flex-1 flex-col items-center justify-center min-h-0 px-5',
      )}
      data-testid="chat-input"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      {...escapeAbortScopeProps}
    >
      {isNewSession && (
        <h1 className="mb-12 text-center text-4xl font-normal text-foreground">
          {NEW_SESSION_HEADING}
        </h1>
      )}
      <div className="relative mx-auto w-full" style={{ maxWidth: `${CHAT_INPUT_MAX_WIDTH}px` }}>
        {isNewSession && recentProjects.length > 0 && (
          <div className="pl-2.5 pt-3 pb-1">
            <ProjectPicker
              projectName={projectLabel}
              hashActive={hashMode}
              recentProjects={recentProjects}
              onSelectProject={(path) => {
                setHashMode(false);
                onSelectProject?.(path);
                void onRefreshGitBranch();
                // Remove the leading # that triggered the picker
                editor
                  .chain()
                  .focus()
                  .deleteRange({ from: COMPOSER_TEXT_START, to: editor.state.selection.from })
                  .run();
              }}
              forceOpen={hashMode}
              onClose={() => {
                setHashMode(false);
                editor.commands.focus();
              }}
            />
          </div>
        )}
        <SlashCommandPopover
          matches={slashMatches}
          selectedIndex={selectedSuggestionIndex}
          onSelect={insertSlashCommand}
          onHover={setSelectedSuggestionIndex}
          onDismiss={() => exitReferenceSuggestion(editor.view, 'skill')}
        >
          <div
            className="relative mx-auto w-full"
            style={{ maxWidth: `${CHAT_INPUT_MAX_WIDTH}px` }}
          >
            {mentionOpen && (
              <FileMentionPopover
                matches={mentionMatches}
                selectedIndex={selectedSuggestionIndex}
                searching={mentionSearching}
                error={mentionError}
                onSelect={(path) => suggestion?.insertReference(path)}
                onHover={setSelectedSuggestionIndex}
              />
            )}
            <InputGroup
              className={cn(
                'relative h-auto flex-col rounded-3xl border bg-background shadow-[0_10px_34px_rgb(0_0_0_/_0.075)]',
                !isNewSession && 'min-h-28',
              )}
              data-has-attachments={attachments.length > 0 || undefined}
            >
              <EditorContent editor={editor} className="w-full" />
              {attachments.length > 0 && (
                <AttachmentChips attachments={attachments} onRemove={handleRemoveAttachment} />
              )}
              <InputGroupAddon
                align="block-end"
                className="min-w-0 justify-between gap-2 px-2.5 pb-2.5 pt-0"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-1">
                  <AttachmentPickerButton onPick={(kind) => void handlePickAttachments(kind)} />
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <ModelSettingsPicker
                    modelLabel={modelLabel}
                    modelValue={session?.model ?? null}
                    modelOptions={modelOptions}
                    onSelectModel={onSelectModel}
                    onRequestModelRefresh={onRequestModelRefresh}
                    thinkingLabel={thinkingLabel}
                    thinkingValue={thinkingValue}
                    thinkingOptions={thinkingLevelOptions}
                    onSelectThinkingLevel={onSelectThinkingLevel}
                  />
                </div>
                {isStreaming ? (
                  <InputGroupButton
                    onClick={onAbort}
                    size="icon-sm"
                    variant="default"
                    className={PRIMARY_ACTION_CLASS_NAME}
                    data-testid="abort-button"
                  >
                    <IconSquare className="fill-current" />
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    onClick={handleSend}
                    size="icon-sm"
                    variant="default"
                    className={PRIMARY_ACTION_CLASS_NAME}
                    data-testid="send-button"
                  >
                    <IconArrowUp />
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
            {isNewSession ? (
              <div className="-mt-15 rounded-b-2xl bg-muted/60 px-4 pt-17 pb-2 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <span
                    className="flex min-w-0 items-center gap-1.5"
                    onClick={() => void onRefreshGitBranch()}
                  >
                    <IconGitBranch className="size-4 shrink-0" />
                    <span className="truncate">{gitBranch ?? UNKNOWN_STATUS}</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 bg-background px-4 pt-1.5 pb-3 text-sm text-muted-foreground">
                <span
                  className="flex min-w-0 items-center gap-1.5"
                  onClick={() => void onRefreshGitBranch()}
                >
                  <IconGitBranch className="size-4 shrink-0" />
                  <span className="truncate">{gitBranch ?? UNKNOWN_STATUS}</span>
                </span>
                <ContextUsageTooltip
                  label={contextUsageLabel}
                  contextUsage={contextUsage}
                  autoCompactionEnabled={autoCompactionEnabled}
                />
              </div>
            )}
          </div>
        </SlashCommandPopover>
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-ring bg-background/85 text-sm font-medium text-foreground">
            Drop files to attach
          </div>
        )}
      </div>
    </div>
  );
}
