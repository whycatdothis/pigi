import {
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { toast } from 'sonner';
import { IconArrowUp, IconGitBranch, IconSquare } from '@tabler/icons-react';
import type {
  ChatAttachmentKind,
  ModelInfo,
  ProjectDirectory,
  SkillSlashCommand,
  ThinkingLevel,
} from '../../../../shared/ipcContract';
import type { SessionEntry } from '../../state/appStore';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '../ui/input-group';
import { CHAT_INPUT_MAX_WIDTH } from '../../lib/layoutConstants';
import { cn } from '../../lib/utils';
import {
  getAllSlashCommands,
  matchSlashCommands,
  EMPTY_SLASH_MATCHES,
  type SlashCommand,
  type SlashCommandMatches,
} from '../../lib/slashCommands';
import { escapeAbortScopeProps } from '../../lib/focusScopes';
import { NEW_CHAT_DRAFT_KEY, readChatDraft, writeChatDraft } from '../../lib/chatDrafts';
import {
  attachmentFromFile,
  attachmentFromPickedFile,
  MAX_PROMPT_ATTACHMENTS,
  type ChatAttachment,
} from '../../lib/chatAttachments';
import { useInputHistory } from '../../hooks/useInputHistory';
import { resizeTextarea } from './textareaMeasure';
import { formatContextUsage, UNKNOWN_STATUS } from './formatters';
import { ContextUsageTooltip } from './contextUsageTooltip';
import { ProjectPicker } from './projectPicker';
import { ModelSettingsPicker } from './modelSettingsPicker';
import { SlashCommandPopover } from './slashCommandPopover';
import { AttachmentChips, AttachmentPickerButton } from './attachmentPicker';

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
  restoreText: string | null;
  onRestoredText: () => void;
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
const NEW_SESSION_HEADING = 'Here we go!';

export default function ChatInput({
  ref,
  onSend,
  onFollowUp,
  onAbort,
  onSlashCommand,
  isStreaming,
  gitBranch,
  restoreText,
  onRestoredText,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);
  // Which input box currently owns the textarea: the active session's path, or
  // NEW_CHAT_DRAFT_KEY while composing the first message of a new chat.
  const draftKey = session?.sessionPath || NEW_CHAT_DRAFT_KEY;
  const activeDraftKeyRef = useRef<string | null>(null);

  const history = useInputHistory(textareaRef, userHistory);
  // Stable references for effect deps; `history` itself changes with userHistory.
  const { reset: resetHistory, getDraftForSave: getHistoryDraft } = history;

  const [slashMatches, setSlashMatches] = useState<SlashCommandMatches>(EMPTY_SLASH_MATCHES);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  // Hash autocomplete state for project switching (#)
  const [hashMode, setHashMode] = useState(false);

  // Files and images attached to the next message. Kept in a ref alongside
  // state so async paste/picker handlers always see the latest list.
  const attachmentsRef = useRef<ChatAttachment[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

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
          toast.error(`Could not attach ${file.name || 'file'}.`);
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
      const result = await window.piApi.pickAttachments(kind, remaining);
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

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.files ?? []);
      if (files.length === 0) return;
      // Attach clipboard files instead of inserting their names/contents.
      event.preventDefault();
      void addFiles(files);
    },
    [addFiles],
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

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);
      void addFiles(files);
    },
    [addFiles],
  );

  const allSlashCommands = useMemo(() => getAllSlashCommands(skillOptions), [skillOptions]);

  // Flat index helpers for keyboard nav across builtin + skill groups
  const flatSlashMatches = useMemo(() => {
    const items: SlashCommand[] = [];
    for (const command of slashMatches.builtin) items.push(command);
    for (const command of slashMatches.skill) items.push(command);
    return items;
  }, [slashMatches]);
  const hasSlashMatches = slashMatches.builtin.length > 0 || slashMatches.skill.length > 0;

  // Save/restore the draft of the input box being switched to/from. Drafts are
  // stored module-level (see lib/chatDrafts.ts) so text typed on the new-chat
  // screen survives the unmount that happens when the user opens a session.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const previousKey = activeDraftKeyRef.current;

    // Save the previous key's draft (if navigating history, the saved draft is
    // what the user actually typed, not the recalled message currently shown)
    if (previousKey !== null && previousKey !== draftKey) {
      writeChatDraft(previousKey, getHistoryDraft());
    }

    // Reset history recall when switching sessions
    resetHistory();

    // Attachments belong to one draft/session; do not carry them across.
    if (previousKey !== draftKey) {
      setAttachmentList([]);
    }

    // Restore the current key's draft and auto-focus the input
    if (previousKey !== draftKey) {
      textarea.value = readChatDraft(draftKey);
      resizeTextarea(textarea);
      textarea.focus();
    }

    activeDraftKeyRef.current = draftKey;
  }, [draftKey, resetHistory, getHistoryDraft, setAttachmentList]);

  // The textarea is detached whenever the input leaves the tree (switching
  // between the new-chat screen and a session). Persist its draft from the ref
  // callback: React still hands over the node there, while an effect cleanup
  // would already see the ref cleared.
  const handleTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null): void => {
      if (node) {
        textareaRef.current = node;
        return;
      }
      const key = activeDraftKeyRef.current;
      if (key !== null) {
        writeChatDraft(key, getHistoryDraft());
      }
      textareaRef.current = null;
    },
    [getHistoryDraft],
  );

  // Restore text from abort/dequeue
  useEffect(() => {
    if (restoreText === null) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Programmatic value change: exit history recall
    resetHistory();
    // Join restored text with current input (current goes last)
    const currentText = textarea.value.trim();
    const combined = [restoreText, currentText].filter((t) => t).join('\n\n');
    textarea.value = combined;
    resizeTextarea(textarea);
    textarea.focus();
    onRestoredText();
  }, [restoreText, onRestoredText, resetHistory]);

  const contextUsage = session?.contextUsage ?? null;
  const autoCompactionEnabled = session?.autoCompactionEnabled ?? false;
  const contextUsageLabel = formatContextUsage(contextUsage, autoCompactionEnabled);
  const modelLabel = session?.model?.name ?? MODEL_FALLBACK;
  const rawThinkingLevel = session?.thinkingLevel ?? null;
  const thinkingValue = rawThinkingLevel;
  const thinkingLabel = rawThinkingLevel ?? THINKING_FALLBACK;

  const clearInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    setSlashMatches(EMPTY_SLASH_MATCHES);
  }, []);

  const insertSlashCommand = useCallback((command: SlashCommand) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.value = `/${command.name} `;
    setSlashMatches(EMPTY_SLASH_MATCHES);
    textarea.focus();
  }, []);

  const handleSend = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const text = textarea.value.trim();
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

      // Skill commands are sent as a regular prompt; the SDK handles expansion
      const skillMatch = allSlashCommands.find((c) => c.source === 'skill' && c.name === name);
      if (skillMatch) {
        clearInput();
        setAttachmentList([]);
        onSend(text, pendingAttachments);
        return;
      }
      // Not a known command: fall through and send as regular message
    }

    clearInput();
    setAttachmentList([]);
    onSend(text, pendingAttachments);
  }, [onSend, onSlashCommand, allSlashCommands, history, clearInput, setAttachmentList]);

  const handleFollowUpSend = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const text = textarea.value.trim();
    const pendingAttachments = attachmentsRef.current;
    if (!text && pendingAttachments.length === 0) return;
    history.reset();
    clearInput();
    setAttachmentList([]);
    onFollowUp(text, pendingAttachments);
  }, [onFollowUp, history, clearInput, setAttachmentList]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing || event.key === 'Process') return;

      // Slash command autocomplete navigation
      if (hasSlashMatches) {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedSlashIndex((i) => (i - 1 + flatSlashMatches.length) % flatSlashMatches.length);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedSlashIndex((i) => (i + 1) % flatSlashMatches.length);
          return;
        }
        if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
          event.preventDefault();
          const selectedCommand = flatSlashMatches[selectedSlashIndex];
          if (selectedCommand) {
            if (selectedCommand.source === 'builtin' && !selectedCommand.hasArg) {
              // Builtin no-arg: execute immediately (e.g., /compact, /new)
              clearInput();
              onSlashCommand(selectedCommand.name, '');
            } else {
              insertSlashCommand(selectedCommand);
            }
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setSlashMatches(EMPTY_SLASH_MATCHES);
          return;
        }
      }

      // Shell-style history recall
      if (history.handleArrowKey(event)) return;

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (event.altKey && isStreaming) {
          handleFollowUpSend();
        } else {
          handleSend();
        }
      }
    },
    [
      handleSend,
      handleFollowUpSend,
      isStreaming,
      hasSlashMatches,
      flatSlashMatches,
      selectedSlashIndex,
      onSlashCommand,
      history,
      clearInput,
      insertSlashCommand,
    ],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    history.handleTyping();
    resizeTextarea(textarea);

    const value = textarea.value;
    setSlashMatches(matchSlashCommands(value, allSlashCommands));
    setSelectedSlashIndex(0);

    // Hash autocomplete detection (only in new session mode)
    if (isNewSession) {
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);
      setHashMode(textBeforeCursor === '#');
    }
  }, [allSlashCommands, isNewSession, history]);

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
                const textarea = textareaRef.current;
                if (textarea) {
                  // Remove the leading # that triggered the picker
                  const cursorPos = textarea.selectionStart;
                  textarea.value = textarea.value.slice(cursorPos);
                  textarea.selectionStart = textarea.selectionEnd = 0;
                  textarea.focus();
                }
              }}
              forceOpen={hashMode}
              onClose={() => {
                setHashMode(false);
                textareaRef.current?.focus();
              }}
            />
          </div>
        )}
        <SlashCommandPopover
          matches={slashMatches}
          selectedIndex={selectedSlashIndex}
          onSelect={insertSlashCommand}
          onHover={setSelectedSlashIndex}
          onDismiss={() => setSlashMatches(EMPTY_SLASH_MATCHES)}
        >
          <div
            className="relative mx-auto w-full"
            style={{ maxWidth: `${CHAT_INPUT_MAX_WIDTH}px` }}
          >
            <InputGroup
              className={cn(
                'relative h-auto flex-col rounded-3xl border bg-background shadow-[0_10px_34px_rgb(0_0_0_/_0.075)] has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-inherit',
                !isNewSession && 'min-h-28',
              )}
            >
              <InputGroupTextarea
                ref={handleTextareaRef}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                onPaste={handlePaste}
                placeholder={isNewSession ? NEW_SESSION_PLACEHOLDER : 'Ask for follow-up changes'}
                rows={1}
                className={cn(
                  'flex-initial field-sizing-fixed px-4 pb-2 text-sm leading-5 placeholder:text-muted-foreground/70 overflow-y-auto',
                  isNewSession ? 'min-h-24 pt-4' : 'min-h-16 pt-4',
                )}
                data-testid="chat-textarea"
              />
              {attachments.length > 0 && (
                <AttachmentChips attachments={attachments} onRemove={handleRemoveAttachment} />
              )}
              <InputGroupAddon
                align="block-end"
                className="min-w-0 justify-between gap-2 px-2.5 pb-2.5 pt-0"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-1">
                  <AttachmentPickerButton
                    attachmentCount={attachments.length}
                    onPick={(kind) => void handlePickAttachments(kind)}
                  />
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
                    className="rounded-full"
                    data-testid="abort-button"
                  >
                    <IconSquare className="fill-current" />
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    onClick={handleSend}
                    size="icon-sm"
                    variant="default"
                    className="rounded-full bg-muted-foreground text-background hover:bg-foreground"
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
