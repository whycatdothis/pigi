import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconArrowRight, IconLoader2 } from '@tabler/icons-react';
import { ChevronsUpDown } from 'lucide-react';
import {
  MAX_DIFF_LINES,
  type GitDiffFile,
  type GitDiffSource,
} from '../../../../shared/ipcContract';
import type { GitDiffLayout } from '../../hooks/useGitWorkspace';
import { useBottomAnchoredScroll } from '../../hooks/useBottomAnchoredScroll';
import { useRememberedScroll } from '../../hooks/useRememberedScroll';
import { formatFileDiffQuote, formatFileLineQuote } from '../../lib/fileQuotes';
import type { QuoteContent } from '../../lib/messageQuotes';
import { splitFileLines } from '../../lib/gitDiffPatch';
import { diffLinesFromSelection } from '../../lib/sourceLineSelection';
import { GIT_DIFF_STATUS_LABELS } from '../../lib/gitDiffLabels';
import { cn } from '../../lib/utils';
import { getGitDiffFile } from '../../services/piAgentClient';
import { FileIcon } from '../fileIcon';
import QuoteSelectionPopover from '../quotes/QuoteSelectionPopover';
import ContainerFind from '../ui/containerFind';
import { SpinningIcon } from '../ui/spinningIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import GitDiffBody from './GitDiffBody';
import SegmentedToggle from './SegmentedToggle';

interface LoadedPatch {
  id: number;
  file: GitDiffFile;
  /** The staged and unstaged halves of one file are different diffs. */
  sourceKind: GitDiffSource['kind'];
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
// Outlives the viewer, which a workspace tab switch unmounts.
let lastWholeFilePath: string | null = null;

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

/**
 * A refresh that fails (a timeout while the agent keeps git busy) keeps the
 * file's diff on screen, as a failed summary refresh keeps the list; only a
 * file with nothing shown yet shows the error.
 */
function failedPatchState(previous: PatchState, file: GitDiffFile, error: string): PatchState {
  if (previous.shown?.file.path === file.path) return { ...previous, incoming: null };
  return { ...EMPTY_PATCH_STATE, error };
}

const LAYOUTS: readonly { value: GitDiffLayout; label: string }[] = [
  { value: 'unified', label: 'Unified' },
  { value: 'split', label: 'Split' },
];

export default function GitDiffViewer({
  projectPath,
  source,
  compareLabel,
  baseLabel,
  file,
  layout,
  onLayoutChange,
  sessionPath,
}: {
  projectPath: string;
  source: GitDiffSource;
  compareLabel: string;
  /** What a base diff compares with (`origin/main`, `HEAD`), for quotes of deleted lines. */
  baseLabel: string;
  file: GitDiffFile;
  layout: GitDiffLayout;
  onLayoutChange: (layout: GitDiffLayout) => void;
  sessionPath: string | null;
}): React.JSX.Element {
  const [patchState, setPatchState] = useState<PatchState>(EMPTY_PATCH_STATE);
  // The path whose whole file is open, so another file starts with changes only.
  const [wholeFilePath, setWholeFilePathState] = useState(lastWholeFilePath);
  const setWholeFilePath = useCallback((path: string | null) => {
    lastWholeFilePath = path;
    setWholeFilePathState(path);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  useBottomAnchoredScroll(containerRef);
  const sourceKind = source.kind;
  const sourceRef =
    source.kind === 'base' ? source.base : source.kind === 'commit' ? source.commit : '';

  // A summary refresh hands in a new `file` object and reads the patch again;
  // an unchanged result keeps the state.
  useEffect(() => {
    let cancelled = false;
    const request: GitDiffSource =
      sourceKind === 'base'
        ? { kind: 'base', base: sourceRef }
        : sourceKind === 'commit'
          ? { kind: 'commit', commit: sourceRef }
          : { kind: sourceKind };
    getGitDiffFile(projectPath, request, file.path, file.oldPath)
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setPatchState((previous) => failedPatchState(previous, file, result.error));
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
            sourceKind,
            patch: result.patch,
            truncated: result.truncated,
            newContent: result.newContent,
          };
          return { shown: previous.error ? null : previous.shown, incoming, error: null };
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPatchState((previous) =>
            failedPatchState(previous, file, 'Unable to read this diff.'),
          );
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
  const shownKey = shown ? `${shown.sourceKind} ${shown.file.path}` : undefined;
  const scrolledKeyRef = useRef(shownKey);
  useLayoutEffect(() => {
    if (scrolledKeyRef.current === shownKey) return;
    scrolledKeyRef.current = shownKey;
    containerRef.current?.scrollTo(0, 0);
  }, [shownKey]);
  // After the reset above: the first file shown after a remount is the one that was left.
  useRememberedScroll(
    containerRef,
    'diff',
    shown
      ? `${projectPath}\0${sourceRef}\0${shownKey}\0${layout}\0${wholeFilePath === shown.file.path}`
      : null,
  );

  const formatQuoteContent = useCallback(
    ({ range }: { range: Range }): QuoteContent | null => {
      if (!isInsideDiffLine(range.startContainer) || !isInsideDiffLine(range.endContainer)) {
        return null;
      }
      if (!shownPath || !containerRef.current) return null;
      const lines = diffLinesFromSelection(containerRef.current, range);
      if (lines.length === 0) return null;
      // Added and context rows carry the working tree's line numbers, so they
      // quote like the Files viewer. Deleted rows have none, and the numbers
      // of a commit or the index point into a file the agent cannot open.
      // A selection across a collapsed gap is not one range of the file.
      const numbers = lines.map((line) => line.newLineNumber);
      const first = numbers[0];
      const workingTree = sourceKind === 'base' || sourceKind === 'unstaged';
      if (
        workingTree &&
        first !== null &&
        numbers.every((number, index) => number === first + index)
      ) {
        return formatFileLineQuote(shownPath, first, first + numbers.length - 1);
      }
      const scope =
        sourceKind === 'base'
          ? `diff against ${baseLabel}`
          : sourceKind === 'commit'
            ? `diff in commit ${sourceRef.slice(0, 7)}`
            : `${sourceKind} diff`;
      return formatFileDiffQuote(shownPath, scope, lines);
    },
    [shownPath, sourceKind, sourceRef, baseLabel],
  );

  const renamed = file.oldPath !== null && file.oldPath !== file.path;
  const current = incoming ?? shown;
  const currentContent = current?.newContent ?? null;
  // Gaps expand from any file; the whole file renders every line, so only up to the cap.
  const fitsWholeFile = useMemo(
    () => currentContent !== null && splitFileLines(currentContent).length <= MAX_DIFF_LINES,
    [currentContent],
  );
  const canShowWholeFile = !error && current?.file.path === file.path && fitsWholeFile;
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
                    data-search-ignore={loaded === incoming || undefined}
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
        <ContainerFind containerRef={containerRef} active placeholder="Find in diff…" />
        {sessionPath && (
          <QuoteSelectionPopover
            containerRef={containerRef}
            sessionPath={sessionPath}
            formatQuoteContent={formatQuoteContent}
          />
        )}
      </div>
    </div>
  );
}
