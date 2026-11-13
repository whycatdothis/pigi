import { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '../../lib/utils';
import {
  type ToolNode,
  getCodemodeDetails,
  getEditDiffDetails,
  getToolArgs,
} from '../../state/transcriptController';
import { CODEMODE_WELL_MAX_HEIGHT, MESSAGE_CONTENT_MAX_WIDTH } from '../../lib/layoutConstants';
import { localFileUrl } from '../../lib/chatAttachments';
import { languageForFile } from '../../lib/fileLanguage';
import SyntaxHighlightedCode from './syntaxHighlightedCode';
import DiffView from './DiffView';
import type { EditEntry, DiffLine } from '../../lib/diffUtils';
import { parseDiffString } from '../../lib/diffUtils';
import { ZoomableImage } from '../zoomableImage';
import {
  getToolCommandParts,
  cleanToolOutput,
  getCodemodeCallParts,
  getCodemodeScript,
  getToolBlockBodyHeightRange,
  READ_IMAGE_RE,
} from '../../lib/toolDisplay';
import OverflowClamp from './overflowClamp';
import { Skeleton } from '../ui/skeleton';
import { IconCheck, IconMinus, IconX } from '@tabler/icons-react';

type CodemodeCalls = NonNullable<ReturnType<typeof getCodemodeDetails>>['calls'];
type CodemodeCall = CodemodeCalls[number];

/**
 * The calls a codemode script made inside its sandbox. They never reach the
 * model as tool calls of their own, so the script's card is the only place
 * they can show what ran.
 */
function CodemodeCallRows({ calls }: { calls: CodemodeCalls }): React.JSX.Element {
  // Formatting parses each call's arguments; every transcript delta re-renders
  // this card, so it happens once per set of calls instead of once per frame.
  const rows = useMemo(
    () => calls.map((call) => ({ call, parts: getCodemodeCallParts(call) })),
    [calls],
  );
  return (
    <div className="flex flex-col gap-0.5 font-mono text-code-compact leading-5">
      {/* The SDK keys every in-flight call `${toolCallId}/?` and only assigns the
          real id when it settles, so the id is not unique while calls overlap;
          the list only ever appends, which makes the position stable. */}
      {rows.map(({ call, parts }, index) => (
        <div key={index}>
          <div className="flex items-baseline gap-1.5" title={call.args}>
            <CodemodeCallIcon status={call.status} />
            <span className="sr-only">{call.status}</span>
            {/* The name stays whole; the arguments are what gives way. */}
            <span className="shrink-0 text-foreground">{parts.prefix}</span>{' '}
            <span className="min-w-0 truncate text-muted-foreground">{parts.body}</span>
            {call.durationMs !== undefined && (
              <span className="ml-auto shrink-0 tabular-nums text-caption text-muted-foreground/60">
                {formatCallDuration(call.durationMs)}
              </span>
            )}
          </div>
          {call.error && <div className="pl-5 text-caption text-danger-fg/90">{call.error}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * A nested call's own duration: most are sub-second, where the footer's `0.1s`
 * floor would make 9ms and 99ms read the same.
 */
function formatCallDuration(durationMs: number): string {
  return durationMs < 1000 ? `${Math.round(durationMs)}ms` : `${(durationMs / 1000).toFixed(1)}s`;
}

function CodemodeCallIcon({ status }: { status: CodemodeCall['status'] }): React.JSX.Element {
  if (status === 'running') {
    return <span className="shrink-0 self-center text-warning-fg">…</span>;
  }
  if (status === 'error') {
    return <IconX className="size-3.5 shrink-0 self-center text-danger-fg [stroke-width:2]" />;
  }
  if (status === 'cancelled') {
    return (
      <IconMinus className="size-3.5 shrink-0 self-center text-muted-foreground [stroke-width:2]" />
    );
  }
  return <IconCheck className="size-3.5 shrink-0 self-center text-success-fg [stroke-width:2]" />;
}

/** A tool's code input — a file about to be written, or a codemode script. */
function CodePreview({
  content,
  language,
  isStreaming,
}: {
  content: string;
  language: string;
  isStreaming: boolean;
}): React.JSX.Element {
  // Strip trailing newline to avoid rendering an extra empty line
  const trimmed = content.endsWith('\n') ? content.slice(0, -1) : content;
  return (
    <div className="overflow-hidden font-mono text-code-compact leading-5">
      <pre className="overflow-x-auto overscroll-x-none whitespace-pre text-muted-foreground">
        <SyntaxHighlightedCode code={trimmed} language={language} isStreaming={isStreaming} />
        {isStreaming && <span className="animate-pulse text-muted-foreground/50">▋</span>}
      </pre>
    </div>
  );
}

/** A well for a run of code or output inside a tool card. */
const CODE_WELL_CLASS_NAME =
  'overflow-hidden rounded-control border border-border/60 bg-background/40 px-2 py-1.5';

/**
 * The body of a codemode card: the script the model wrote, in its own well, the
 * calls it made inside the sandbox, and what it printed, in a second one.
 *
 * Both wells clamp from the top at the same height: the tail of the script is
 * what ran last, and the tail of the output is what the script was for. The
 * call rows between them never clamp — they are one line each.
 */
function CodemodeBody({
  script,
  calls,
  output,
  showOutput,
}: {
  script: string | null;
  calls: CodemodeCalls;
  output: string;
  showOutput: boolean;
}): React.JSX.Element | null {
  const hasOutput = showOutput && output.length > 0;
  // The title pays for the body's gap only when something follows it.
  if (!script && calls.length === 0 && !hasOutput) return null;
  return (
    <>
      {script && (
        <div className={`${CODE_WELL_CLASS_NAME} mb-2`}>
          <OverflowClamp maxHeight={CODEMODE_WELL_MAX_HEIGHT} tailAnchor>
            <CodePreview content={script} language="javascript" isStreaming={false} />
          </OverflowClamp>
        </div>
      )}
      {calls.length > 0 && (
        <div className="mb-2">
          <CodemodeCallRows calls={calls} />
        </div>
      )}
      {hasOutput && (
        <div className={CODE_WELL_CLASS_NAME}>
          <OverflowClamp maxHeight={CODEMODE_WELL_MAX_HEIGHT} tailAnchor>
            <pre className="overflow-x-auto overscroll-x-none whitespace-pre font-mono text-code leading-5 text-muted-foreground">
              {output}
            </pre>
          </OverflowClamp>
        </div>
      )}
    </>
  );
}

/** Six 20px rows fill TOOL_BLOCK_BODY_MIN_HEIGHT_LARGE exactly, so the card
 *  never shrinks when the real diff/file replaces the placeholder. */
const DIFF_SKELETON_ROWS = [
  { tint: '', width: 'w-2/3' },
  { tint: 'bg-red-500/10', width: 'w-1/2' },
  { tint: 'bg-red-500/10', width: 'w-2/5' },
  { tint: 'bg-green-500/10', width: 'w-3/4' },
  { tint: 'bg-green-500/10', width: 'w-2/5' },
  { tint: '', width: 'w-3/5' },
];
const WRITE_SKELETON_WIDTHS = ['w-1/2', 'w-4/5', 'w-2/3', 'w-3/4', 'w-1/3', 'w-3/5'];
const BASH_SKELETON_WIDTHS = ['w-3/4', 'w-2/3', 'w-1/2', 'w-3/5'];

function DiffSkeleton(): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded font-mono text-code-compact leading-5" aria-hidden>
      {DIFF_SKELETON_ROWS.map((row, index) => (
        <div key={index} className={cn('flex h-5 items-center gap-2 px-2', row.tint)}>
          <Skeleton className="h-3.5 w-6 shrink-0" />
          <Skeleton className={cn('h-3.5', row.width)} />
        </div>
      ))}
    </div>
  );
}

function WriteSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col font-mono text-code-compact leading-5" aria-hidden>
      {WRITE_SKELETON_WIDTHS.map((width, index) => (
        <div key={index} className="flex h-5 items-center gap-2">
          <Skeleton className="h-3.5 w-6 shrink-0" />
          <Skeleton className={cn('h-3.5', width)} />
        </div>
      ))}
    </div>
  );
}

/** No line-number gutter, unlike WriteSkeleton, to read as terminal output. */
function BashSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col font-mono text-code leading-5" aria-hidden>
      {BASH_SKELETON_WIDTHS.map((width, index) => (
        <div key={index} className="flex h-5 items-center">
          <Skeleton className={cn('h-3.5', width)} />
        </div>
      ))}
    </div>
  );
}

interface ToolBlockProps {
  node: ToolNode;
}

const STATUS_CONFIG = {
  running: {
    label: 'Running',
    className: 'text-warning-fg',
    Icon: null,
  },
  success: {
    label: 'Succeeded',
    className: 'text-success-fg',
    Icon: IconCheck,
  },
  error: {
    label: 'Failed',
    className: 'text-danger-fg',
    Icon: IconX,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'text-muted-foreground',
    Icon: IconMinus,
  },
} as const;

function ElapsedTimer({ startedAt }: { startedAt?: number }): React.JSX.Element {
  const [startMs] = useState(() => startedAt ?? Date.now());
  const [elapsed, setElapsed] = useState(() => (Date.now() - startMs) / 1000);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((Date.now() - startMs) / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [startMs]);

  return <span className="tabular-nums">{elapsed.toFixed(1)}s</span>;
}

/** Tools that stream output while running (shown immediately, not gated on completion) */
const STREAMING_OUTPUT_TOOLS = new Set(['bash', 'read', 'codemode']);

const SECONDS_PER_MILLISECOND = 1 / 1000;

function getToolOutputLanguage(node: ToolNode, output: string): string {
  const args = getToolArgs(node);
  if (typeof args?.path !== 'string') return '';
  return languageForFile(args.path, typeof args.content === 'string' ? args.content : output);
}

/** Extract pre-computed DiffLines from tool result details (used by tagged-edit and similar tools) */
function getEditDiffFromDetails(node: ToolNode): DiffLine[][] | null {
  if (node.name !== 'edit') return null;
  const details = getEditDiffDetails(node);
  if (!details?.diff) return null;
  const parsed = parseDiffString(details.diff);
  return parsed.length > 0 ? parsed : null;
}

function getWriteEntries(node: ToolNode): EditEntry[] | null {
  if (node.name !== 'write') return null;
  const args = getToolArgs(node);
  const content = typeof args?.content === 'string' ? args.content : null;
  if (!content) return null;
  return [{ oldText: '', newText: content }];
}

function formatDuration(durationMs: number | undefined): string | null {
  if (durationMs === undefined || !Number.isFinite(durationMs)) {
    return null;
  }

  const seconds = Math.max(0.1, durationMs * SECONDS_PER_MILLISECOND);
  const formattedSeconds = seconds < 10 ? seconds.toFixed(1) : Math.round(seconds).toString();
  return `${formattedSeconds}s`;
}

function getReadImagePath(node: ToolNode): string | null {
  if (node.name !== 'read') return null;
  const lines = node.output.split('\n');
  if (!lines[0]?.match(READ_IMAGE_RE)) return null;
  const args = getToolArgs(node);
  return typeof args?.path === 'string' ? args.path : null;
}

export default function ToolBlock({ node }: ToolBlockProps): React.JSX.Element | null {
  const [commandExpanded, setCommandExpanded] = useState(false);
  const commandRef = useRef<HTMLSpanElement>(null);
  const [isCommandTruncated, setIsCommandTruncated] = useState(false);

  // For read tool: filter hint lines and detect images
  const cleanedOutput = useMemo(() => cleanToolOutput(node), [node]);
  const codemodeScript = useMemo(() => getCodemodeScript(node), [node]);
  const codemodeCalls = useMemo(() => getCodemodeDetails(node)?.calls ?? [], [node]);
  const imagePath = useMemo(() => getReadImagePath(node), [node]);

  const command = getToolCommandParts(node);
  const editDiffFromDetails = useMemo(() => getEditDiffFromDetails(node), [node]);
  // Keyed on the command text, not the node: a streaming output batch rewrites
  // the node, and reading scrollHeight forces a layout of the whole transcript.
  useEffect(() => {
    if (commandRef.current) {
      setIsCommandTruncated(commandRef.current.scrollHeight > commandRef.current.clientHeight);
    }
  }, [command.body, command.prefix, commandExpanded]);

  // Read tool returns fast — skip rendering the running state to avoid flicker
  if (node.name === 'read' && node.status === 'running') return null;

  const statusConfig = STATUS_CONFIG[node.status];
  const statusClassName = statusConfig.className;
  const StatusIcon = statusConfig.Icon;
  const writeEntries = getWriteEntries(node);
  const hasOutput = cleanedOutput.length > 0;
  // A running tool's body is empty until content loads; a placeholder shaped
  // like its real output stands in for a blank card.
  const showEditSkeleton = node.name === 'edit' && node.status === 'running';
  const showWriteSkeleton =
    node.name === 'write' && node.status === 'running' && (writeEntries?.length ?? 0) === 0;
  const showBashSkeleton = node.name === 'bash' && node.status === 'running' && !hasOutput;
  const isCodemode = node.name === 'codemode';
  const outputLanguage = getToolOutputLanguage(node, cleanedOutput);
  const bodyHeightRange = getToolBlockBodyHeightRange(node);
  // The body is one array so its "is there anything to show" and the padding that
  // depends on it cannot drift apart: the title pays the status bar's own 6px
  // only when something follows it.
  const bodyParts = [
    node.status !== 'running' && node.status !== 'error' && editDiffFromDetails ? (
      <DiffView key="diff" lines={editDiffFromDetails} />
    ) : null,
    showEditSkeleton ? <DiffSkeleton key="diff-skeleton" /> : null,
    // Write preview shown during running (streaming) unlike edit which waits for completion
    writeEntries && writeEntries.length > 0 && node.status !== 'error' ? (
      <CodePreview
        key="write-preview"
        content={writeEntries[0].newText}
        language={outputLanguage}
        isStreaming={node.status === 'running'}
      />
    ) : null,
    showWriteSkeleton ? <WriteSkeleton key="write-skeleton" /> : null,
    isCodemode ? (
      <CodemodeBody
        key="codemode"
        script={codemodeScript}
        calls={codemodeCalls}
        output={cleanedOutput}
        showOutput={node.status !== 'running' || STREAMING_OUTPUT_TOOLS.has(node.name)}
      />
    ) : null,
    !isCodemode &&
    (node.status !== 'running' || STREAMING_OUTPUT_TOOLS.has(node.name)) &&
    hasOutput &&
    ((node.name !== 'edit' && node.name !== 'write') || node.status === 'error') ? (
      <pre
        key="output"
        className="overflow-x-auto overscroll-x-none whitespace-pre font-mono text-code leading-5 text-muted-foreground"
      >
        <SyntaxHighlightedCode
          code={cleanedOutput}
          language={outputLanguage}
          isStreaming={node.status === 'running'}
        />
      </pre>
    ) : null,
    showBashSkeleton ? <BashSkeleton key="bash-skeleton" /> : null,
  ];
  const hasBody = bodyParts.some((part) => part !== null);
  const durationLabel = formatDuration(node.durationMs);
  const args = getToolArgs(node);
  const timeout = typeof args?.timeout === 'number' ? args.timeout : undefined;
  const titleRowClassName = cn(
    '-mx-3 flex items-start gap-1 px-3 pt-1.5 font-mono text-code font-medium leading-5 text-foreground',
    hasBody ? 'pb-1.5' : 'pb-0',
  );

  return (
    <>
      <div
        className="overflow-clip rounded-surface-sm border border-border/65 bg-muted/25 px-3 pt-0 pb-1.5 text-body text-muted-foreground"
        style={{ maxWidth: `${MESSAGE_CONTENT_MAX_WIDTH}px` }}
        data-testid={`tool-block-${node.toolCallId}`}
      >
        {command.body ? (
          <div className={titleRowClassName}>
            <span className="shrink-0">{command.prefix}</span>
            <span
              ref={commandRef}
              className={cn(
                'min-w-0 break-words [overflow-wrap:anywhere]',
                !commandExpanded && 'line-clamp-2',
              )}
            >
              {command.body}
            </span>
            {(isCommandTruncated || commandExpanded) && (
              <button
                type="button"
                onClick={() => setCommandExpanded((v) => !v)}
                className="shrink-0 self-end text-caption font-normal text-muted-foreground hover:text-foreground"
              >
                {commandExpanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
        ) : (
          <div className={titleRowClassName}>
            <span className="shrink-0">{command.prefix}</span>
            <span className="min-w-0 text-muted-foreground">…</span>
          </div>
        )}

        <OverflowClamp
          minHeight={bodyHeightRange.minHeight}
          maxHeight={bodyHeightRange.maxHeight}
          tailAnchor={node.name !== 'edit' && node.name !== 'codemode'}
        >
          {bodyParts}
        </OverflowClamp>

        <div
          data-search-ignore
          className={cn(
            '-mx-3 -mb-2 flex items-center justify-between gap-1.5 px-3 py-1.5 text-caption font-medium',
            statusClassName,
          )}
        >
          <span className="flex items-center gap-1">
            {StatusIcon && <StatusIcon className="size-3.5 shrink-0 [stroke-width:2]" />}
            {node.status === 'running' ? (
              <ElapsedTimer startedAt={node.startedAt} />
            ) : (
              <>{durationLabel && <span>{durationLabel}</span>}</>
            )}
          </span>
          {timeout !== undefined && <span data-search-ignore>Timeout {timeout}s</span>}
        </div>
      </div>
      {imagePath && (
        <div className="mt-2">
          <ZoomableImage
            src={localFileUrl(imagePath)}
            alt={imagePath}
            className="max-w-full rounded border border-border/40 object-contain"
          />
        </div>
      )}
    </>
  );
}
