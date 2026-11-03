import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowRight, IconFileText, IconLoader2 } from '@tabler/icons-react';
import type { GitDiffFile, GitDiffSource } from '../../../../shared/ipcContract';
import type { GitDiffLayout } from '../../hooks/useGitDiffWorkspace';
import { formatFileContentQuote, formatFileLineQuote } from '../../lib/fileQuotes';
import { GIT_DIFF_STATUS_LABELS } from '../../lib/gitDiffLabels';
import { cn } from '../../lib/utils';
import { getGitDiffFile } from '../../services/piAgentClient';
import { FileIcon } from '../fileIcon';
import QuoteSelectionPopover from '../quotes/QuoteSelectionPopover';
import { SpinningIcon } from '../ui/spinningIcon';
import GitDiffBody from './GitDiffBody';

type PatchState =
  | { status: 'loading' }
  | { status: 'ready'; patch: string; truncated: boolean; newContent: string | null }
  | { status: 'error'; error: string };

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

const LAYOUTS: readonly { value: GitDiffLayout; label: string }[] = [
  { value: 'unified', label: 'Unified' },
  { value: 'split', label: 'Split' },
];

function LayoutToggle({
  value,
  onChange,
}: {
  value: GitDiffLayout;
  onChange: (layout: GitDiffLayout) => void;
}): React.JSX.Element {
  return (
    <div className="flex h-6 shrink-0 items-center gap-0.5 rounded-control bg-muted p-0.5">
      {LAYOUTS.map((layout) => (
        <button
          key={layout.value}
          type="button"
          aria-pressed={value === layout.value}
          onClick={() => onChange(layout.value)}
          className={cn(
            'h-5 rounded-control-sm px-2 text-caption leading-none transition-colors',
            value === layout.value
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {layout.label}
        </button>
      ))}
    </div>
  );
}

export default function GitDiffViewer({
  projectPath,
  source,
  compareLabel,
  file,
  layout,
  onLayoutChange,
  sessionPath,
}: {
  projectPath: string;
  source: GitDiffSource;
  compareLabel: string;
  file: GitDiffFile;
  layout: GitDiffLayout;
  onLayoutChange: (layout: GitDiffLayout) => void;
  sessionPath: string | null;
}): React.JSX.Element {
  const [patchState, setPatchState] = useState<PatchState>({ status: 'loading' });
  const [wholeFile, setWholeFile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceKind = source.kind;
  const sourceRef = source.kind === 'base' ? source.base : source.commit;

  // A summary refresh hands in a new `file` object and reads the patch again.
  // The patch on screen stays until the new one arrives, and an unchanged
  // result keeps the old state, so a refresh never flashes.
  useEffect(() => {
    let cancelled = false;
    const request: GitDiffSource =
      sourceKind === 'base'
        ? { kind: 'base', base: sourceRef }
        : { kind: 'commit', commit: sourceRef };
    getGitDiffFile(projectPath, request, file.path, file.oldPath)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setPatchState({ status: 'error', error: result.error });
          return;
        }
        setPatchState((previous) =>
          previous.status === 'ready' &&
          previous.patch === result.patch &&
          previous.newContent === result.newContent &&
          previous.truncated === result.truncated
            ? previous
            : {
                status: 'ready',
                patch: result.patch,
                truncated: result.truncated,
                newContent: result.newContent,
              },
        );
      })
      .catch(() => {
        if (!cancelled) setPatchState({ status: 'error', error: 'Unable to read this diff.' });
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, sourceKind, sourceRef, file]);

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

  const renamed = file.oldPath !== null && file.oldPath !== file.path;
  const canShowWholeFile = patchState.status === 'ready' && patchState.newContent !== null;

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b-[0.5px] border-foreground/27 px-3">
        <FileIcon path={file.path} className="size-4" />
        <span
          className="flex min-w-0 flex-1 items-center gap-1.5 text-caption text-muted-foreground"
          title={renamed ? `${file.oldPath} → ${file.path}` : file.path}
        >
          {renamed && (
            <>
              <span className="min-w-0 truncate line-through decoration-foreground/30">
                {file.oldPath}
              </span>
              <IconArrowRight size={12} className="shrink-0" />
            </>
          )}
          <span className="min-w-0 truncate text-foreground/80">{file.path}</span>
        </span>
        <span className="shrink-0 text-caption text-muted-foreground">
          {GIT_DIFF_STATUS_LABELS[file.status]}
        </span>
        {!file.binary && (
          <span className="flex shrink-0 gap-1 text-2xs tabular-nums">
            <span className="text-success-fg">+{file.additions}</span>
            <span className="text-danger-fg">-{file.deletions}</span>
          </span>
        )}
        <span
          className="hidden max-w-48 shrink-0 truncate text-2xs text-muted-foreground @[900px]:inline"
          title={compareLabel}
        >
          {compareLabel}
        </span>
        <LayoutToggle value={layout} onChange={onLayoutChange} />
        <button
          type="button"
          aria-label="Show whole file"
          aria-pressed={wholeFile}
          title={wholeFile ? 'Show changes only' : 'Show whole file'}
          disabled={!canShowWholeFile}
          onClick={() => setWholeFile((value) => !value)}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
            wholeFile && 'bg-accent text-foreground',
          )}
        >
          <IconFileText size={14} />
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
            // Fades in late, so a quick load never flashes a spinner.
            <div className="flex h-full animate-in items-center justify-center gap-2 text-caption text-muted-foreground delay-300 fade-in-0 fill-mode-backwards">
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
              <GitDiffBody
                file={file}
                patch={patchState.patch}
                newContent={patchState.newContent}
                layout={layout}
                wholeFile={wholeFile}
              />
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
