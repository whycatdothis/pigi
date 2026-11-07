import { useContext, useMemo, type ReactNode } from 'react';
import { displayFileName } from '../../lib/chatAttachments';
import { useExistingPath } from '../../lib/existingPaths';
import { highlightMatches } from '../../lib/highlightMatches';
import {
  INTERACTIVE_PATH_CHIP_CLASS,
  INTERACTIVE_REFERENCE_CHIP_CLASS,
  PATH_CHIP_CLASS,
  REFERENCE_CHIP_CLASS,
} from '../../lib/referenceChipStyles';
import { userMessageSegments, type UserMessageSegment } from '../../lib/userMessageSegments';
import { FileIcon } from '../fileIcon';
import { ChatFilesContext } from './chatFiles';

function countMatches(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let count = 0;
  for (
    let index = lowerText.indexOf(lowerQuery);
    index !== -1;
    index = lowerText.indexOf(lowerQuery, index + lowerQuery.length)
  ) {
    count++;
  }
  return count;
}

/**
 * The composer's chip, sent: drawn once the path is known to exist, and plain
 * text until then (an API route, a typo, an `@` that was never a file). A file
 * opens in the Files tab.
 */
function SentPathChip({
  segment,
}: {
  segment: Exclude<UserMessageSegment, { kind: 'text' }>;
}): React.JSX.Element {
  const chatFiles = useContext(ChatFilesContext);
  const existing = useExistingPath(chatFiles?.cwd ?? '', chatFiles ? segment.path : null);
  if (!existing || !chatFiles) return <span>{segment.text}</span>;

  const isReference = segment.kind === 'reference';
  const content = (
    <>
      {!existing.isDirectory && <FileIcon path={segment.path} />}
      <span className="truncate">{isReference ? displayFileName(segment.path) : segment.path}</span>
    </>
  );
  if (existing.isDirectory) {
    return (
      <span className={isReference ? REFERENCE_CHIP_CLASS : PATH_CHIP_CLASS} title={existing.path}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={isReference ? INTERACTIVE_REFERENCE_CHIP_CLASS : INTERACTIVE_PATH_CHIP_CLASS}
      title={existing.path}
      onClick={() => chatFiles.onOpenFile(existing.path)}
    >
      {content}
    </button>
  );
}

/**
 * A sent prompt with its `@` references and paths drawn as the composer drew
 * them. Search counts occurrences over the whole text, so each run starts its
 * count after the matches before it; a chip holding a match goes back to its
 * text, since a chip may not show the part that matched.
 */
export function UserMessageText({
  text,
  searchQuery,
  activeOccurrenceIndex,
}: {
  text: string;
  searchQuery: string;
  activeOccurrenceIndex: number | null;
}): ReactNode {
  const segments = useMemo(() => userMessageSegments(text), [text]);
  const query = searchQuery.trim() ? searchQuery : '';

  return segments.map((segment) => {
    if (segment.kind !== 'text' && !(query && countMatches(segment.text, query) > 0)) {
      return <SentPathChip key={segment.start} segment={segment} />;
    }
    const before = query ? countMatches(text.slice(0, segment.start), query) : 0;
    const activeIndex = activeOccurrenceIndex === null ? null : activeOccurrenceIndex - before;
    return <span key={segment.start}>{highlightMatches(segment.text, query, activeIndex)}</span>;
  });
}
