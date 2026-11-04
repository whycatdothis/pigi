import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { MAX_DIFF_LINES, type GitDiffFile } from '../../../../shared/ipcContract';
import type { GitDiffLayout } from '../../hooks/useGitWorkspace';
import { languageForPath } from '../../lib/fileLanguage';
import {
  buildDiffRows,
  changedRanges,
  DIFF_LINE_PREFIX,
  isSourceLine,
  pairSplitRows,
  parseGitPatch,
  splitFileLines,
  type ChangedRange,
  type GitDiffGapRow,
  type GitDiffPatchLine,
  type GitDiffSourceLine,
} from '../../lib/gitDiffPatch';
import { cn } from '../../lib/utils';
import {
  isWithinHighlightBudget,
  tokenStyle,
  useHighlightedLines,
  type HighlightedLine,
} from '../message/codeHighlighting';

const LINE_STYLES = {
  add: 'bg-success-bg text-success-fg',
  remove: 'bg-danger-bg text-danger-fg',
  context: 'bg-background text-foreground',
} as const;

const GUTTER_CLASS_NAME =
  'w-10 shrink-0 select-none bg-inherit pr-2 text-right text-muted-foreground tabular-nums';

interface DiffTokens {
  old: ReadonlyMap<number, HighlightedLine>;
  new: ReadonlyMap<number, HighlightedLine>;
  settled: boolean;
}

function tokensByNumber(
  sideLines: readonly GitDiffSourceLine[],
  tokens: HighlightedLine[] | null,
  numberOf: (line: GitDiffSourceLine) => number | null,
): Map<number, HighlightedLine> {
  const byNumber = new Map<number, HighlightedLine>();
  // A count that disagrees with the rows means shiki split the text
  // differently; plain rows are safer than shifted colours.
  if (!tokens || tokens.length !== sideLines.length) return byNumber;
  sideLines.forEach((line, index) => {
    const number = numberOf(line);
    if (number !== null) byNumber.set(number, tokens[index]);
  });
  return byNumber;
}

/**
 * The old side is the patch's removed and context lines highlighted as one
 * text; the new side is the whole new file when it fits the budget, so
 * expanded lines and multi-line tokens keep their colours. Tokens are keyed by
 * line number on each side.
 */
function useDiffTokens(
  lines: readonly GitDiffPatchLine[],
  newContent: string | null,
  language: string,
): DiffTokens {
  const sides = useMemo(() => {
    const oldSide: GitDiffSourceLine[] = [];
    const newSide: GitDiffSourceLine[] = [];
    for (const line of lines) {
      if (!isSourceLine(line)) continue;
      if (line.kind !== 'add') oldSide.push(line);
      if (line.kind !== 'remove') newSide.push(line);
    }
    return { oldSide, newSide };
  }, [lines]);
  const wholeNewFile = newContent !== null && isWithinHighlightBudget(newContent);
  const oldText = useMemo(() => sides.oldSide.map((line) => line.text).join('\n'), [sides]);
  const newText = useMemo(
    () => (wholeNewFile ? newContent : sides.newSide.map((line) => line.text).join('\n')),
    [newContent, sides, wholeNewFile],
  );
  const hasRemoved = sides.oldSide.some((line) => line.kind === 'remove');
  const oldTokens = useHighlightedLines(oldText, hasRemoved ? language : '');
  const newTokens = useHighlightedLines(newText, sides.newSide.length > 0 ? language : '');

  return useMemo(() => {
    let newByNumber: Map<number, HighlightedLine>;
    if (wholeNewFile) {
      newByNumber = new Map();
      newTokens.lines?.forEach((tokens, index) => newByNumber.set(index + 1, tokens));
    } else {
      newByNumber = tokensByNumber(sides.newSide, newTokens.lines, (line) => line.newLineNumber);
    }
    return {
      old: tokensByNumber(sides.oldSide, oldTokens.lines, (line) => line.oldLineNumber),
      new: newByNumber,
      settled: oldTokens.settled && newTokens.settled,
    };
  }, [sides, wholeNewFile, oldTokens, newTokens]);
}

const MARK_STYLES = {
  add: 'bg-success-fg/20',
  remove: 'bg-danger-fg/20',
  context: '',
} as const;

/** The highlighted pieces of `start..end` of a line, cut out of its tokens. */
function tokenPieces(
  tokens: HighlightedLine,
  start: number,
  end: number,
  keyPrefix: string,
): React.JSX.Element[] {
  const pieces: React.JSX.Element[] = [];
  let offset = 0;
  tokens.forEach((token, index) => {
    const tokenEnd = offset + token.content.length;
    const from = Math.max(start, offset);
    const to = Math.min(end, tokenEnd);
    if (from < to) {
      pieces.push(
        <span key={`${keyPrefix}-${index}`} style={tokenStyle(token)}>
          {token.content.slice(from - offset, to - offset)}
        </span>,
      );
    }
    offset = tokenEnd;
  });
  return pieces;
}

function LineText({
  line,
  tokens,
  changed,
  wrap,
}: {
  line: GitDiffSourceLine;
  tokens: DiffTokens;
  changed: readonly ChangedRange[] | undefined;
  wrap: boolean;
}): React.JSX.Element {
  const lineTokens =
    line.kind === 'remove'
      ? tokens.old.get(line.oldLineNumber ?? 0)
      : tokens.new.get(line.newLineNumber ?? 0);
  const text = line.text;
  // Ranges index the patch text; tokens that do not spell it out cannot be cut by them.
  const marks =
    changed &&
    (!lineTokens ||
      lineTokens.reduce((length, token) => length + token.content.length, 0) === text.length)
      ? changed
      : [];
  const piece = (start: number, end: number, key: string): React.ReactNode =>
    lineTokens ? tokenPieces(lineTokens, start, end, key) : text.slice(start, end);

  const content: React.ReactNode[] = [];
  let offset = 0;
  marks.forEach(([start, end], index) => {
    if (offset < start) content.push(piece(offset, start, `plain-${index}`));
    content.push(
      <span key={`mark-${index}`} className={MARK_STYLES[line.kind]}>
        {piece(start, end, `mark-${index}`)}
      </span>,
    );
    offset = end;
  });
  if (offset < text.length || content.length === 0) {
    content.push(piece(offset, text.length, 'tail'));
  }

  return (
    <span
      data-diff-text
      className={cn(
        'min-w-0 pr-4',
        wrap ? 'flex-1 whitespace-pre-wrap wrap-break-word' : 'whitespace-pre',
      )}
    >
      {content}
    </span>
  );
}

function GapRow({
  row,
  onExpand,
}: {
  row: GitDiffGapRow;
  onExpand: () => void;
}): React.JSX.Element {
  const className =
    'flex min-h-6 w-full items-center gap-2 bg-muted/40 px-3 text-left font-sans text-caption text-muted-foreground';
  if (row.hiddenLines === 0) {
    return <div className={className}>{row.text}</div>;
  }
  const content = (
    <>
      <span className="shrink-0">
        {row.hiddenLines} unmodified {row.hiddenLines === 1 ? 'line' : 'lines'}
      </span>
      {row.text && <span className="truncate font-mono opacity-70">{row.text}</span>}
    </>
  );
  // Expanding renders every line at once; past the patch's own cap that stalls.
  if (row.hiddenLines > MAX_DIFF_LINES) {
    return <div className={className}>{content}</div>;
  }
  return (
    <button
      type="button"
      className={cn(className, 'transition-colors hover:bg-muted hover:text-foreground')}
      onClick={onExpand}
    >
      <ChevronsUpDown size={13} className="shrink-0" />
      {content}
    </button>
  );
}

function MetaRow({ text }: { text: string }): React.JSX.Element {
  return <div className="px-3 py-0.5 text-caption text-muted-foreground">{text}</div>;
}

/**
 * One file's patch, unified or side by side. Gaps between hunks expand from
 * the new file, which is also why the whole file can be shown. Rows stay
 * invisible until highlighting lands, so they never flash from plain to
 * coloured.
 */
// The viewer re-renders on every selection, refresh and sidebar view change;
// without this the body already on screen re-rendered too (280–400ms for a
// 750-row patch in dev, on the way to every file switch).
const GitDiffBody = memo(function GitDiffBody({
  id,
  file,
  patch,
  newContent,
  layout,
  wholeFile,
  onSettled,
}: {
  id: number;
  file: GitDiffFile;
  patch: string;
  newContent: string | null;
  layout: GitDiffLayout;
  wholeFile: boolean;
  /** Called with `id` once highlighting has landed and the body can be shown. */
  onSettled?: (id: number) => void;
}): React.JSX.Element {
  const lines = useMemo(() => parseGitPatch(patch), [patch]);
  const newFileLines = useMemo(
    () => (newContent === null ? null : splitFileLines(newContent)),
    [newContent],
  );
  // Gaps are numbered by hunk, so a refreshed patch starts collapsed rather
  // than opening whichever gap now carries an old number.
  const [expansion, setExpansion] = useState<{ patch: string; hunks: ReadonlySet<number> }>(() => ({
    patch,
    hunks: new Set(),
  }));
  const expanded = useMemo(
    () => (expansion.patch === patch ? expansion.hunks : new Set<number>()),
    [expansion, patch],
  );
  const tokens = useDiffTokens(lines, newContent, languageForPath(file.path));
  const changed = useMemo(() => changedRanges(lines), [lines]);
  useEffect(() => {
    if (tokens.settled) onSettled?.(id);
  }, [tokens.settled, onSettled, id]);
  const rows = useMemo(
    () => buildDiffRows(lines, newFileLines, wholeFile ? 'all' : expanded),
    [lines, newFileLines, wholeFile, expanded],
  );
  // A file that was only added (or only deleted) is one colour already; the
  // +/- column, the empty number column and the gap rows add nothing.
  const onlyKind = useMemo(() => {
    const kinds = new Set(lines.filter(isSourceLine).map((line) => line.kind));
    if (kinds.size !== 1) return null;
    const [kind] = kinds;
    return kind === 'context' ? null : kind;
  }, [lines]);

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-caption text-muted-foreground">
        {file.status === 'renamed'
          ? 'Renamed without changes to its content.'
          : 'This file has no textual diff.'}
      </div>
    );
  }

  const expand = (hunkIndex: number): void =>
    setExpansion({ patch, hunks: new Set(expanded).add(hunkIndex) });

  if (layout === 'split' && !onlyKind) {
    return (
      // A drag stays in the column it starts in: the other column's rows sit
      // between this column's rows in the DOM, so without this a selection
      // down one side swallows the other.
      <div
        onMouseDown={(event) => {
          const cell =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-diff-side]')
              : null;
          const side = cell?.dataset.diffSide;
          if (side) event.currentTarget.dataset.selectSide = side;
          else delete event.currentTarget.dataset.selectSide;
        }}
        className={cn(
          'w-full py-1 font-mono text-code-compact leading-5',
          'data-[select-side=new]:**:data-[diff-side=old]:select-none data-[select-side=old]:**:data-[diff-side=new]:select-none',
          !tokens.settled && 'invisible',
        )}
      >
        {pairSplitRows(rows).map((row, index) => {
          if (row.kind === 'gap') {
            return <GapRow key={index} row={row} onExpand={() => expand(row.hunkIndex)} />;
          }
          if (row.kind === 'meta') return <MetaRow key={index} text={row.text} />;
          return (
            <div key={index} className="grid min-h-5 grid-cols-2">
              {[row.left, row.right].map((line, side) =>
                line ? (
                  <div
                    key={side}
                    data-diff-line
                    data-diff-kind={line.kind}
                    data-diff-side={side === 0 ? 'old' : 'new'}
                    data-new-line={line.newLineNumber ?? undefined}
                    className={cn(
                      'flex min-w-0',
                      LINE_STYLES[line.kind],
                      side === 0 && 'border-r-[0.5px] border-foreground/15',
                    )}
                  >
                    <span className={GUTTER_CLASS_NAME}>
                      {side === 0 ? line.oldLineNumber : line.newLineNumber}
                    </span>
                    <span className="w-4 shrink-0 select-none text-center opacity-50">
                      {DIFF_LINE_PREFIX[line.kind]}
                    </span>
                    <LineText line={line} tokens={tokens} changed={changed.get(line)} wrap />
                  </div>
                ) : (
                  <div
                    key={side}
                    className={cn(
                      'bg-muted/50',
                      side === 0 && 'border-r-[0.5px] border-foreground/15',
                    )}
                  />
                ),
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-max min-w-full py-1 font-mono text-code-compact leading-5',
        !tokens.settled && 'invisible',
      )}
    >
      {rows.map((row, index) => {
        if (row.kind === 'gap') {
          if (onlyKind) return null;
          return <GapRow key={index} row={row} onExpand={() => expand(row.hunkIndex)} />;
        }
        if (row.kind === 'meta') return <MetaRow key={index} text={row.text} />;
        return (
          <div
            key={index}
            data-diff-line
            data-diff-kind={row.kind}
            data-new-line={row.newLineNumber ?? undefined}
            className={cn('flex min-h-5 w-max min-w-full', LINE_STYLES[row.kind])}
          >
            {onlyKind !== 'add' && (
              <span
                className={cn(
                  GUTTER_CLASS_NAME,
                  'sticky left-0 z-10',
                  onlyKind === 'remove' && 'border-r-[0.5px] border-foreground/15',
                )}
              >
                {row.oldLineNumber ?? ''}
              </span>
            )}
            {onlyKind !== 'remove' && (
              <span
                className={cn(
                  GUTTER_CLASS_NAME,
                  'sticky z-10 border-r-[0.5px] border-foreground/15',
                  onlyKind === 'add' ? 'left-0' : 'left-10',
                )}
              >
                {row.newLineNumber ?? ''}
              </span>
            )}
            {onlyKind ? (
              <span className="w-2 shrink-0" />
            ) : (
              <span className="w-4 shrink-0 select-none text-center opacity-50">
                {DIFF_LINE_PREFIX[row.kind]}
              </span>
            )}
            <LineText line={row} tokens={tokens} changed={changed.get(row)} wrap={false} />
          </div>
        );
      })}
    </div>
  );
});

export default GitDiffBody;
