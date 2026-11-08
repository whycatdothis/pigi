import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconAlertTriangle, IconCheck, IconCopy, IconLoader2 } from '@tabler/icons-react';
import { cn, formatFileSize } from '../../lib/utils';
import { formatFileContentQuote, formatFileLineQuote } from '../../lib/fileQuotes';
import type { LineRange } from '../../lib/filePathCandidates';
import type { QuoteContent } from '../../lib/messageQuotes';
import {
  isBitmapImagePath,
  isMarkdownPath,
  isSvgPath,
  languageForPath,
} from '../../lib/fileLanguage';
import { sourceLineRangeFromSelection } from '../../lib/sourceLineSelection';
import { MESSAGE_LIST_MAX_WIDTH } from '../../lib/layoutConstants';
import MarkdownMessage from '../message/markdownMessage';
import SyntaxHighlightedCode from '../message/syntaxHighlightedCode';
import QuoteSelectionPopover from '../quotes/QuoteSelectionPopover';
import ContainerFind from '../ui/containerFind';
import { ZoomableImage } from '../zoomableImage';
import { localFileUrl } from '../../lib/chatAttachments';
import { isAbsoluteFilePath } from '../../lib/projectFileLinks';
import { FileIcon } from '../fileIcon';
import { SpinningIcon } from '../ui/spinningIcon';
import { useBottomAnchoredScroll } from '../../hooks/useBottomAnchoredScroll';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useRememberedScroll } from '../../hooks/useRememberedScroll';

/** A text view with this many lines is already well past reading; the rest is cut and announced. */
const MAX_RENDERED_LINES = 5000;

type FileState =
  | { status: 'loading' }
  | { status: 'ready'; content: string; size: number; truncated: boolean }
  | { status: 'error'; error: string };

type ViewMode = 'preview' | 'source';

// Outlives the viewer, which a workspace tab switch unmounts.
let lastViewMode: ViewMode = 'preview';

/** Lines a chat link opened the file at: highlighted, and scrolled to once. */
export interface FileLineTarget {
  projectPath: string;
  filePath: string;
  lines: LineRange;
}

// Outlives the viewer too, so a remount after a tab switch keeps its remembered
// scroll instead of jumping back to the lines.
let lastRevealedTarget: FileLineTarget | null = null;

const VIEW_MODES: readonly { value: ViewMode; label: string }[] = [
  { value: 'preview', label: 'Preview' },
  { value: 'source', label: 'Source' },
];

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}): React.JSX.Element {
  return (
    <div className="flex h-6 shrink-0 items-center gap-0.5 rounded-control bg-muted p-0.5">
      {VIEW_MODES.map((mode) => (
        <button
          key={mode.value}
          type="button"
          aria-pressed={value === mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            'h-5 rounded-control-sm px-2.5 text-caption leading-none transition-colors',
            value === mode.value
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function FileStateMessage({
  error,
  loading,
}: {
  error?: string;
  loading?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div className="flex max-w-md items-center gap-2 text-caption text-muted-foreground">
        {loading ? (
          <SpinningIcon>
            <IconLoader2 size={14} />
          </SpinningIcon>
        ) : (
          <IconAlertTriangle size={15} className="shrink-0" />
        )}
        <span>{error ?? 'Loading file…'}</span>
      </div>
    </div>
  );
}

// Both wrappers fill the pane so `scale-down` can fit a large image to it; a
// small one keeps its own size.
function FileImage({ src, alt }: { src: string; alt: string }): React.JSX.Element {
  return (
    <div className="h-full p-6 [&_[data-rmiz-content]]:block [&_[data-rmiz-content]]:size-full [&_[data-rmiz]]:block [&_[data-rmiz]]:size-full">
      <ZoomableImage
        src={src}
        alt={alt}
        className="size-full object-scale-down"
        draggable={false}
      />
    </div>
  );
}

/**
 * The Files tab's reading pane. Source mode quotes a line range; rendered
 * markdown has no stable source lines, so its quotes carry the selected text
 * instead.
 */
export default function FileViewer({
  projectPath,
  filePath,
  fileRevision,
  lineTarget,
  sessionPath,
  onOpenFile,
}: {
  projectPath: string;
  filePath: string;
  fileRevision: number;
  lineTarget: FileLineTarget | null;
  sessionPath: string | null;
  onOpenFile: (path: string) => void;
}): React.JSX.Element {
  const isBitmap = isBitmapImagePath(filePath);
  const [fileState, setFileState] = useState<FileState>({ status: 'loading' });
  const isMarkdown = isMarkdownPath(filePath);
  const isSvg = isSvgPath(filePath);
  // Line numbers exist only in the source view. Opening a file there at its
  // lines counts as choosing it, so a remount after a tab switch comes back to
  // whichever view the user left.
  const [viewMode, setViewModeState] = useState<ViewMode>(
    lineTarget && lineTarget !== lastRevealedTarget ? 'source' : lastViewMode,
  );
  const [sourceShownFor, setSourceShownFor] = useState(lineTarget);
  if (lineTarget !== sourceShownFor) {
    setSourceShownFor(lineTarget);
    if (lineTarget) setViewModeState('source');
  }
  const setViewMode = useCallback((mode: ViewMode) => {
    lastViewMode = mode;
    setViewModeState(mode);
  }, []);
  const showsPreview = (isMarkdown || isSvg) && viewMode === 'preview';
  const containerRef = useRef<HTMLDivElement>(null);
  const { copied: pathCopied, copy: copyPath } = useCopyFeedback(filePath);
  useBottomAnchoredScroll(containerRef);
  useRememberedScroll(
    containerRef,
    'file',
    fileState.status === 'ready' ? `${projectPath}\0${filePath}\0${showsPreview}` : null,
  );
  // The revision busts the image cache, which would otherwise keep showing the old file.
  const absolutePath = isAbsoluteFilePath(filePath) ? filePath : `${projectPath}/${filePath}`;
  const imageSource = `${localFileUrl(absolutePath)}?v=${fileRevision}`;
  const language = languageForPath(filePath);
  const markdownProjectFile = useMemo(
    () => ({ projectPath, filePath, onOpenFile }),
    [filePath, onOpenFile, projectPath],
  );

  useEffect(() => {
    if (isBitmap) return;
    let cancelled = false;
    window.piApi
      .readProjectFile(projectPath, filePath)
      .then((result) => {
        if (cancelled) return;
        setFileState(
          result.success
            ? {
                status: 'ready',
                content: result.content,
                size: result.size,
                truncated: result.truncated,
              }
            : { status: 'error', error: result.error },
        );
      })
      .catch(() => {
        if (!cancelled) setFileState({ status: 'error', error: 'Unable to read this file' });
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, filePath, fileRevision, isBitmap]);

  const source = useMemo(() => {
    if (fileState.status !== 'ready') {
      return { content: '', hiddenLines: 0, totalLines: 0 };
    }
    const lines = fileState.content.split('\n');
    if (lines.length <= MAX_RENDERED_LINES) {
      return { content: fileState.content, hiddenLines: 0, totalLines: lines.length };
    }
    return {
      content: lines.slice(0, MAX_RENDERED_LINES).join('\n'),
      hiddenLines: lines.length - MAX_RENDERED_LINES,
      totalLines: lines.length,
    };
  }, [fileState]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !lineTarget || lineTarget === lastRevealedTarget) return;
    if (fileState.status !== 'ready' || showsPreview) return;
    const line = container.querySelector(`[data-source-line="${lineTarget.lines.start}"]`);
    if (!line) return;
    lastRevealedTarget = lineTarget;
    if (isMarkdown || isSvg) lastViewMode = 'source';
    const offset = line.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop += offset - container.clientHeight / 3;
  }, [lineTarget, fileState.status, showsPreview, isMarkdown, isSvg]);

  const formatSourceQuote = useCallback(
    ({ range }: { text: string; range: Range }): QuoteContent | null => {
      const lines = sourceLineRangeFromSelection(range);
      return lines ? formatFileLineQuote(filePath, lines.start, lines.end) : null;
    },
    [filePath],
  );
  const formatPreviewQuote = useCallback(
    ({ text }: { text: string; range: Range }): QuoteContent =>
      formatFileContentQuote(filePath, text),
    [filePath],
  );
  const formatQuoteContent = showsPreview ? formatPreviewQuote : formatSourceQuote;

  const notice =
    fileState.status === 'ready' && fileState.truncated
      ? `Showing a truncated view of this ${formatFileSize(fileState.size)} file.`
      : source.hiddenLines > 0
        ? `Showing the first ${MAX_RENDERED_LINES.toLocaleString()} of ${source.totalLines.toLocaleString()} lines.`
        : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3">
        <FileIcon path={filePath} className="size-4" />
        <div className="group/path flex min-w-0 flex-1 items-center gap-1">
          <span
            className="min-w-0 truncate text-caption text-muted-foreground select-text"
            title={filePath}
          >
            {filePath}
          </span>
          <button
            type="button"
            aria-label="Copy path"
            title="Copy path"
            onClick={copyPath}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-control-sm text-muted-foreground opacity-0 transition-opacity group-hover/path:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100',
              pathCopied && 'opacity-100',
            )}
          >
            {pathCopied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          </button>
        </div>
        {(isMarkdown || isSvg) && <ViewModeToggle value={viewMode} onChange={setViewMode} />}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          tabIndex={0}
          aria-label="File content"
          data-testid="file-viewer"
          className="h-full overflow-auto bg-background select-text outline-none"
        >
          {isBitmap ? (
            <FileImage src={imageSource} alt={filePath} />
          ) : fileState.status === 'loading' ? (
            <FileStateMessage loading />
          ) : fileState.status === 'error' ? (
            <FileStateMessage error={fileState.error} />
          ) : (
            <>
              {notice && (
                <div className="border-b-[0.5px] border-foreground/27 px-4 py-1.5 text-caption text-muted-foreground">
                  {notice}
                </div>
              )}
              {isSvg && showsPreview ? (
                <FileImage src={imageSource} alt={filePath} />
              ) : showsPreview ? (
                <div
                  className="user-content mx-auto w-full px-6 py-6"
                  style={{ maxWidth: `${MESSAGE_LIST_MAX_WIDTH}px` }}
                >
                  <MarkdownMessage text={source.content} projectFile={markdownProjectFile} />
                </div>
              ) : (
                <div className="w-max min-w-full px-3 py-3 font-mono">
                  <SyntaxHighlightedCode
                    code={source.content}
                    language={language}
                    lineNumbers
                    markedLines={lineTarget?.lines}
                  />
                </div>
              )}
            </>
          )}
        </div>
        <ContainerFind containerRef={containerRef} active placeholder="Find in file…" />
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
