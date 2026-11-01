import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconLoader2, IconRefresh } from '@tabler/icons-react';
import type { GitDiffFile } from '../../../../shared/ipcContract';
import { formatFileContentQuote, formatFileLineQuote } from '../../lib/fileQuotes';
import { GIT_DIFF_STATUS_LABELS } from '../../lib/gitDiffLabels';
import { parseGitPatch } from '../../lib/gitDiffPatch';
import { cn } from '../../lib/utils';
import { getGitDiffFile } from '../../services/piAgentClient';
import { FileIcon } from '../fileIcon';
import QuoteSelectionPopover from '../quotes/QuoteSelectionPopover';
import { SpinningIcon } from '../ui/spinningIcon';

type PatchState =
  | { status: 'loading' }
  | { status: 'ready'; patch: string; truncated: boolean }
  | { status: 'error'; error: string };

const LINE_STYLES = {
  add: 'bg-success-bg text-success-fg',
  remove: 'bg-danger-bg text-danger-fg',
  context: 'bg-background text-foreground',
} as const;

const PREFIX = {
  add: '+',
  remove: '-',
  context: ' ',
} as const;

function isInsideDiffLine(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest('[data-diff-line]') !== null;
}

/** New-file line numbers of the rows a selection touches, or null if it hits a deleted row. */
function newLineRange(container: HTMLElement, range: Range): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  let sawRow = false;
  for (const row of container.querySelectorAll<HTMLDivElement>('[data-diff-line]')) {
    if (!range.intersectsNode(row)) continue;
    sawRow = true;
    const value = row.dataset.newLine;
    if (value === undefined) return null;
    start = Math.min(start, Number(value));
    end = Math.max(end, Number(value));
  }
  return sawRow && start !== Infinity ? { start, end } : null;
}

function PatchLines({ patch }: { patch: string }): React.JSX.Element {
  const lines = useMemo(() => parseGitPatch(patch), [patch]);
  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-caption text-muted-foreground">
        This file has no textual diff.
      </div>
    );
  }

  return (
    <div className="w-max min-w-full py-1 font-mono text-code-compact leading-5">
      {lines.map((line, index) => {
        if (line.kind === 'hunk') {
          return (
            <div key={index} className="bg-muted/40 px-3 py-0.5 text-caption text-muted-foreground">
              {line.text}
            </div>
          );
        }
        if (line.kind === 'meta') {
          return (
            <div key={index} className="px-3 py-0.5 text-caption text-muted-foreground">
              {line.text}
            </div>
          );
        }

        return (
          <div
            key={index}
            data-diff-line
            data-new-line={line.newLineNumber ?? undefined}
            className={cn('flex min-h-5 w-max min-w-full', LINE_STYLES[line.kind])}
          >
            <span className="sticky left-0 z-10 w-10 shrink-0 select-none bg-inherit pr-2 text-right text-muted-foreground tabular-nums">
              {line.oldLineNumber ?? ''}
            </span>
            <span className="sticky left-10 z-10 w-10 shrink-0 select-none border-r-[0.5px] border-foreground/15 bg-inherit pr-2 text-right text-muted-foreground tabular-nums">
              {line.newLineNumber ?? ''}
            </span>
            <span className="w-4 shrink-0 select-none text-center opacity-50">
              {PREFIX[line.kind]}
            </span>
            <span className="whitespace-pre pr-8">{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function GitDiffViewer({
  projectPath,
  base,
  baseLabel,
  file,
  sessionPath,
  onRefresh,
}: {
  projectPath: string;
  base: string;
  baseLabel: string;
  file: GitDiffFile;
  sessionPath: string | null;
  onRefresh: () => void;
}): React.JSX.Element {
  const [patchState, setPatchState] = useState<PatchState>({ status: 'loading' });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Deferred so the effect body does not set state synchronously, which the
    // react-hooks/set-state-in-effect rule rejects.
    queueMicrotask(() => {
      if (cancelled) return;
      setPatchState({ status: 'loading' });
      getGitDiffFile(projectPath, base, file.path, file.oldPath, file.status === 'untracked')
        .then((result) => {
          if (cancelled) return;
          setPatchState(
            result.success
              ? { status: 'ready', patch: result.patch, truncated: result.truncated }
              : { status: 'error', error: result.error },
          );
        })
        .catch(() => {
          if (!cancelled) setPatchState({ status: 'error', error: 'Unable to read this diff.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath, base, file]);

  const formatQuoteText = useCallback(
    ({ text, range }: { text: string; range: Range }): string => {
      if (!isInsideDiffLine(range.startContainer) || !isInsideDiffLine(range.endContainer)) {
        return '';
      }
      // Added and context rows carry the file's post-change line numbers, so
      // they quote like the Files viewer. A selection that touches deleted
      // rows has no such number and falls back to carrying the text.
      const lines = containerRef.current ? newLineRange(containerRef.current, range) : null;
      if (lines) return formatFileLineQuote(file.path, lines.start, lines.end);
      return formatFileContentQuote(file.path, text);
    },
    [file.path],
  );

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b-[0.5px] border-foreground/27 px-3">
        <FileIcon path={file.path} className="size-4" />
        <span
          className="min-w-0 flex-1 truncate text-caption text-muted-foreground"
          title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        >
          {file.path}
        </span>
        <span className="shrink-0 text-caption text-muted-foreground">
          {GIT_DIFF_STATUS_LABELS[file.status]}
        </span>
        {file.status === 'untracked' ? (
          <span className="shrink-0 text-2xs text-success-fg">new</span>
        ) : (
          <>
            <span className="shrink-0 text-2xs text-success-fg">+{file.additions}</span>
            <span className="shrink-0 text-2xs text-danger-fg">-{file.deletions}</span>
          </>
        )}
        <span
          className="hidden max-w-40 shrink-0 truncate text-2xs text-muted-foreground @[900px]:inline"
          title={`Compared with ${baseLabel}`}
        >
          vs {baseLabel}
        </span>
        <button
          type="button"
          aria-label="Refresh diff"
          title="Refresh diff"
          onClick={onRefresh}
          className="flex size-6 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconRefresh size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          tabIndex={0}
          aria-label="Diff content"
          data-testid="git-diff-viewer"
          className="h-full overflow-auto bg-background select-text outline-none"
        >
          {patchState.status === 'loading' && (
            <div className="flex h-full items-center justify-center gap-2 text-caption text-muted-foreground">
              <SpinningIcon>
                <IconLoader2 size={14} />
              </SpinningIcon>
              Loading diff…
            </div>
          )}
          {patchState.status === 'error' && (
            <div className="flex h-full items-center justify-center px-6 text-center text-caption text-danger-fg">
              {patchState.error}
            </div>
          )}
          {patchState.status === 'ready' && (
            <>
              {patchState.truncated && (
                <div className="border-b-[0.5px] border-foreground/27 px-4 py-1.5 text-caption text-muted-foreground">
                  This diff is too large to show in full.
                </div>
              )}
              <PatchLines patch={patchState.patch} />
            </>
          )}
        </div>
        {sessionPath && (
          <QuoteSelectionPopover
            containerRef={containerRef}
            sessionPath={sessionPath}
            formatQuoteText={formatQuoteText}
          />
        )}
      </div>
    </div>
  );
}
