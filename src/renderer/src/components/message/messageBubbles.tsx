import React, { useEffect, useMemo, useState } from 'react';
import {
  IconBinaryTree,
  IconCheck,
  IconCopy,
  IconGitFork,
  IconSparkles,
  IconTerminal2,
} from '@tabler/icons-react';
import {
  type SystemNode,
  type TranscriptNode,
  type UserNode,
} from '../../state/transcriptController';
import { isNavigableNode } from '../../lib/sessionTreeLayout';
import { useMessageActions } from './messageActions';
import { SessionTreeHelpButton } from '../sessionTree/SessionTreeHelpDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import BranchSummaryCard from './branchSummaryCard';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import MarkdownMessage from './markdownMessage';
import OverflowClamp from './overflowClamp';
import { highlightMatches } from '../../lib/highlightMatches';
import ShimmerOverlay from './shimmerOverlay';
import { parseSkillBlock, type ParsedSkillBlock } from '../../lib/skillBlock';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';

/** Matches a slash command like `/plannotator-review` or `/review staged`. */
const SLASH_COMMAND_PATTERN = /^\/([a-z][a-z0-9_-]*)(\s.*)?$/i;

function parseSlashCommand(text: string): { name: string; args: string } | null {
  if (text.includes('\n')) return null;
  const match = text.match(SLASH_COMMAND_PATTERN);
  if (!match) return null;
  return { name: match[1], args: (match[2] ?? '').trim() };
}

/**
 * Shared message bubbles (user / system / toolbar) used by both the classic
 * MessageList and the minimal (codex-style) MinimalView.
 */

const USER_MESSAGE_MAX_HEIGHT_VH = 0.2;

/** The message has no session entry yet, so there is nothing to navigate to. */
function isInFlight(node: TranscriptNode): boolean {
  if (node.role === 'assistant') return node.isStreaming;
  if (node.role === 'tool') return node.status === 'running';
  return false;
}

/**
 * Uniform spacing between a message's content and its action icons. Applied
 * inside the toolbar so every placement (user bubble, assistant text, tool
 * block) has the same clear gap.
 */
const ACTION_TOOLBAR_OFFSET_CLASS_NAME = 'mt-0.5';

const ACTION_ICON_SIZE = 15;

const ACTION_BUTTON_CLASS_NAME =
  'flex items-center justify-center rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

/**
 * Long delay: these are destructive-ish actions next to every message, so the
 * label should only show up when the pointer is really parked on the icon.
 */
const ACTION_TOOLTIP_DELAY_MS = 1000;

/**
 * Hover label for an icon-only message action. Disabled buttons do not receive
 * pointer events, so the trigger wraps the button instead of being the button.
 */
function MessageActionTooltip({
  label,
  hint,
  disabled,
  showHelp = false,
  children,
}: {
  label: string;
  hint?: string;
  disabled: boolean;
  /** Adds the "?" that explains the session tree. */
  showHelp?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span className={disabled ? 'inline-flex cursor-not-allowed' : 'inline-flex'}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" collisionPadding={8} className="items-center gap-3">
        <span className="flex flex-col items-start gap-0.5">
          {/* display:block so the tooltip's two lines do not glue together */}
          <span className="block">{label}</span>
          {hint && <span className="block opacity-70">{hint}</span>}
        </span>
        {showHelp && <SessionTreeHelpButton onBeforeOpen={() => setOpen(false)} />}
      </TooltipContent>
    </Tooltip>
  );
}

export function MessageToolbar({ node }: { node: TranscriptNode }): React.JSX.Element {
  const text =
    node.role === 'tool'
      ? node.output
      : node.role === 'assistant'
        ? node.text || node.thinking
        : node.text;
  const { copied, copy } = useCopyFeedback(text);
  const { onTree, onFork, disabledReason } = useMessageActions();
  const showTreeActions = isNavigableNode(node) && !isInFlight(node);
  const disabled = disabledReason !== null;

  // Rewinding before a user message is the only case that moves text around,
  // so it is the only case that needs the extra line.
  const treeHint =
    !disabled && node.role === 'user' ? 'This message goes back to the input box' : undefined;

  return (
    <TooltipProvider delayDuration={ACTION_TOOLTIP_DELAY_MS}>
      <div
        className={`flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${ACTION_TOOLBAR_OFFSET_CLASS_NAME}`}
      >
        <button
          type="button"
          className={ACTION_BUTTON_CLASS_NAME}
          onClick={copy}
          aria-label="Copy message"
        >
          {copied ? <IconCheck size={ACTION_ICON_SIZE} /> : <IconCopy size={ACTION_ICON_SIZE} />}
        </button>
        {showTreeActions && onTree && (
          <MessageActionTooltip
            label={disabledReason ?? 'Move the session here'}
            hint={treeHint}
            disabled={disabled}
            showHelp
          >
            <button
              type="button"
              className={ACTION_BUTTON_CLASS_NAME}
              onClick={() => onTree(node)}
              disabled={disabled}
              aria-label="Move the session here"
            >
              <IconBinaryTree size={ACTION_ICON_SIZE} />
            </button>
          </MessageActionTooltip>
        )}
        {showTreeActions && onFork && (
          <MessageActionTooltip
            label={disabledReason ?? 'Continue in a new chat'}
            disabled={disabled}
          >
            <button
              type="button"
              className={ACTION_BUTTON_CLASS_NAME}
              onClick={() => onFork(node)}
              disabled={disabled}
              aria-label="Continue in a new chat"
            >
              <IconGitFork size={ACTION_ICON_SIZE} />
            </button>
          </MessageActionTooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

function formatUserMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (isSameLocalDay(date, new Date())) {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    year: isSameLocalYear(date, new Date()) ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameLocalYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear();
}

function SkillLinkBubble({
  skillBlock,
  timestamp,
  searchQuery,
  activeOccurrenceIndex,
}: {
  skillBlock: ParsedSkillBlock;
  timestamp: number;
  searchQuery: string;
  activeOccurrenceIndex: number | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex justify-end pb-2 pt-6" data-testid="skill-message">
      <div className="group flex max-w-[85%] flex-col items-end">
        <div className="rounded-2xl bg-muted px-3.5 py-1.5 text-[15px] leading-6 text-foreground max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] w-fit">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline text-[var(--system-accent)] hover:opacity-80 cursor-pointer"
              >
                <IconSparkles className="size-4 shrink-0 inline -mt-0.5 mr-0.5" />
                {skillBlock.name}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-[32rem] max-h-[60vh] overflow-y-auto p-4"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <IconSparkles className="size-4 shrink-0" />
                <span>{skillBlock.name}</span>
              </div>
              <MarkdownMessage text={skillBlock.body} />
            </PopoverContent>
          </Popover>
          {skillBlock.userMessage && (
            <> {highlightMatches(skillBlock.userMessage, searchQuery, activeOccurrenceIndex)}</>
          )}
        </div>
        <div className="flex w-full items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground" data-search-ignore>
            {formatUserMessageTime(timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CommandBubble({
  name,
  args,
  timestamp,
}: {
  name: string;
  args: string;
  timestamp: number;
}): React.JSX.Element {
  return (
    <div className="flex justify-end pb-2 pt-6" data-testid="command-message">
      <div className="group flex max-w-[85%] flex-col items-end">
        <div className="rounded-2xl bg-muted px-3.5 py-1.5 text-[15px] leading-6 text-foreground max-w-full w-fit">
          <span className="text-[var(--system-accent)]">
            <IconTerminal2 className="size-4 shrink-0 inline -mt-0.5 mr-0.5" />
            <span className="font-medium">{name}</span>
          </span>
          {args && <span className="ml-1 text-muted-foreground">{args}</span>}
        </div>
        <div className="flex w-full items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground" data-search-ignore>
            {formatUserMessageTime(timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function UserBubble({
  node,
  searchQuery,
  activeOccurrenceIndex,
}: {
  node: UserNode;
  searchQuery: string;
  activeOccurrenceIndex: number | null;
}): React.JSX.Element {
  const { text } = node;

  const [maxHeight, setMaxHeight] = useState(() =>
    Math.round(window.innerHeight * USER_MESSAGE_MAX_HEIGHT_VH),
  );
  useEffect(() => {
    const handleResize = (): void =>
      setMaxHeight(Math.round(window.innerHeight * USER_MESSAGE_MAX_HEIGHT_VH));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const skillBlock = useMemo(() => parseSkillBlock(text), [text]);
  const slashCommand = useMemo(() => parseSlashCommand(text), [text]);

  if (skillBlock) {
    return (
      <SkillLinkBubble
        skillBlock={skillBlock}
        timestamp={node.sentAt}
        searchQuery={searchQuery}
        activeOccurrenceIndex={activeOccurrenceIndex}
      />
    );
  }

  if (slashCommand) {
    return (
      <CommandBubble name={slashCommand.name} args={slashCommand.args} timestamp={node.sentAt} />
    );
  }

  return (
    <div className="flex justify-end pb-2 pt-6" data-testid="user-message">
      <div className="group flex max-w-[85%] flex-col items-end">
        <div className="max-w-full w-fit overflow-clip rounded-2xl bg-muted px-3.5 py-2">
          <OverflowClamp
            maxHeight={maxHeight}
            tailAnchor={false}
            className="text-[15px] leading-6 text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          >
            {highlightMatches(text, searchQuery, activeOccurrenceIndex)}
          </OverflowClamp>
        </div>
        <div className="flex w-full items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <MessageToolbar node={node} />
          <span className="text-xs text-muted-foreground" data-search-ignore>
            {formatUserMessageTime(node.sentAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SystemBubble({
  node,
  searchQuery,
  activeOccurrenceIndex,
}: {
  node: SystemNode;
  searchQuery: string;
  activeOccurrenceIndex: number | null;
}): React.JSX.Element {
  if (node.kind === 'branch' && node.detail) {
    return <BranchSummaryCard text={node.detail} />;
  }

  return (
    <div className="flex items-center gap-3 py-2" data-testid="system-message">
      <div className="h-px flex-1 bg-border" />
      <span className="relative shrink-0 text-sm text-muted-foreground overflow-hidden">
        {highlightMatches(node.text, searchQuery, activeOccurrenceIndex)}
        {node.isLoading && <ShimmerOverlay />}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
