import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowRight, IconLoader2 } from '@tabler/icons-react';
import { ChevronsUpDown } from 'lucide-react';
import type { GitDiffFile, GitDiffSource } from '../../../../shared/ipcContract';
import type { GitDiffLayout } from '../../hooks/useGitWorkspace';
import { useBottomAnchoredScroll } from '../../hooks/useBottomAnchoredScroll';
import { formatFileContentQuote, formatFileLineQuote } from '../../lib/fileQuotes';
import { GIT_DIFF_STATUS_LABELS } from '../../lib/gitDiffLabels';
import { cn } from '../../lib/utils';
import { getGitDiffFile } from '../../services/piAgentClient';
import { FileIcon } from '../fileIcon';
import QuoteSelectionPopover from '../quotes/QuoteSelectionPopover';
import { SpinningIcon } from '../ui/spinningIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import GitDiffBody from './GitDiffBody';
import SegmentedToggle from './SegmentedToggle';

interface LoadedPatch {
  id: number;
  file: GitDiffFile;
  patch: string;
  truncated: boolean;
  newContent: string | null;
}

/**
 * `shown` is on screen; `incoming` renders hidden beside it until its
 * highlighting lands and then takes its place, so switching files or picking
 * up a refresh never paints a blank or uncoloured frame.
 */
interface PatchState {
  shown: LoadedPatch | null;
  incoming: LoadedPatch | null;
  error: string | null;
}

const EMPTY_PATCH_STATE: PatchState = { shown: null, incoming: null, error: null };
let nextPatchId = 0;

function samePatch(
  loaded: LoadedPatch | null,
  file: GitDiffFile,
  patch: { patch: string; truncated: boolean; newContent: string | null },
): boolean {
  return (
    loaded !== null &&
    loaded.file.path === file.path &&
    loaded.patch === patch.patch &&
    loaded.truncated === patch.truncated &&
    loaded.newContent === patch.newContent
  );
}

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
  const [patchState, setPatchState] = useState<PatchState>(EMPTY_PATCH_STATE);
  // The path whose whole file is open, so another file starts with changes only.
  const [wholeFilePath, setWholeFilePath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useBottomAnchoredScroll(containerRef);
  const sourceKind = source.kind;
  const sourceRef = source.kind === 'base' ? source.base : source.commit;

  // A summary refresh hands in a new `file` object and reads the patch again;
  // an unchanged result keeps the state.
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
          setPatchState({ ...EMPTY_PATCH_STATE, error: result.error });
          return;
        }
        setPatchState((previous) => {
          if (
            samePatch(previous.incoming ?? (previous.error ? null : previous.shown), file, result)
          ) {
            return previous;
          }
          if (samePatch(previous.shown, file, result)) {
            return { ...previous, incoming: null, error: null };
          }
          const incoming = {
            id: (nextPatchId += 1),
            file,
            patch: result.patch,
            truncated: result.truncated,
            newContent: result.newContent,
          };
          return { shown: previous.error ? null : previous.shown, incoming, error: null };
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPatchState({ ...EMPTY_PATCH_STATE, error: 'Unable to read this diff.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, sourceKind, sourceRef, file]);

  const promote = useCallback((id: number) => {
    setPatchState((previous) =>
      previous.incoming?.id === id
        ? { shown: previous.incoming, incoming: null, error: null }
        : previous,
    );
  }, []);

  const { shown, incoming, error } = patchState;
  const shownPath = shown?.file.path;
  // Another file starts at its top; a refresh of the same file keeps its place.
  const scrolledPathRef = useRef(shownPath);
  useLayoutEffect(() => {
    if (scrolledPathRef.current === shownPath) return;
    scrolledPathRef.current = shownPath;
    containerRef.current?.scrollTo(0, 0);
  }, [shownPath]);

  const formatQuoteText = useCallback(
    ({ text, range }: { text: string; range: Range }): string => {
      if (!isInsideDiffLine(range.startContainer) || !isInsideDiffLine(range.endContainer)) {
        return '';
      }
      // Added and context rows carry the file's post-change line numbers, so
      // they quote like the Files viewer. A selection that touches deleted
      // rows has no such number, and a commit's numbers point into a file the
      // agent cannot open, so both carry the text instead.
      if (!shownPath) return '';
      const lines =
        containerRef.current && sourceKind === 'base'
          ? newLineRange(containerRef.current, range)
          : null;
      if (lines) return formatFileLineQuote(shownPath, lines.start, lines.end);
      return formatFileContentQuote(shownPath, text);
    },
    [shownPath, sourceKind],
  );

  const renamed = file.oldPath !== null && file.oldPath !== file.path;
  const current = incoming ?? shown;
  const canShowWholeFile =
    !error && current?.file.path === file.path && current.newContent !== null;
  const wholeFile = canShowWholeFile && wholeFilePath === file.path;

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
        <SegmentedToggle options={LAYOUTS} value={layout} onChange={onLayoutChange} />
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            {/* On the wrapper, so a disabled button still explains itself. */}
            <TooltipTrigger asChild>
              <span className="flex shrink-0">
                <button
                  type="button"
                  aria-label="Show whole file"
                  aria-pressed={wholeFile}
                  disabled={!canShowWholeFile}
                  onClick={() => setWholeFilePath(wholeFile ? null : file.path)}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
                    wholeFile && 'bg-accent text-foreground',
                  )}
                >
                  <ChevronsUpDown size={14} />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {!canShowWholeFile
                ? 'The whole file is not available for this diff'
                : wholeFile
                  ? 'Show changes only'
                  : 'Show the whole file'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          tabIndex={0}
          aria-label="Diff content"
          data-testid="git-diff-viewer"
          className="relative h-full overflow-auto bg-background select-text outline-none"
        >
          {!shown && !error && (
            // Fades in late, so a quick load never flashes a spinner.
            <div className="flex h-full animate-in items-center justify-center gap-2 text-caption text-muted-foreground delay-300 fade-in-0 fill-mode-backwards">
              <SpinningIcon>
                <IconLoader2 size={14} />
              </SpinningIcon>
              Loading diff…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center px-6 text-center text-caption text-danger-fg">
              {error}
            </div>
          )}
          {!error &&
            [shown, incoming].map(
              (loaded) =>
                loaded && (
                  // Keyed by id in one parent, so promotion restyles the
                  // highlighted body instead of mounting it again.
                  <div
                    key={loaded.id}
                    aria-hidden={loaded === incoming || undefined}
                    className={cn(
                      loaded === incoming &&
                        'pointer-events-none invisible absolute inset-x-0 top-0 h-full overflow-hidden',
                    )}
                  >
                    {loaded.truncated && (
                      <div className="border-b-[0.5px] border-foreground/27 px-4 py-1.5 text-caption text-muted-foreground">
                        This diff is too large to show in full.
                      </div>
                    )}
                    <GitDiffBody
                      id={loaded.id}
                      file={loaded.file}
                      patch={loaded.patch}
                      newContent={loaded.newContent}
                      layout={layout}
                      wholeFile={wholeFilePath === loaded.file.path}
                      onSettled={loaded === incoming ? promote : undefined}
                    />
                  </div>
                ),
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
