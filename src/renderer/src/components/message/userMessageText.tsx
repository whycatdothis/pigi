import { useContext, useMemo, type ReactNode } from 'react';
import { displayFileName } from '../../lib/chatAttachments';
import { useExistingFile } from '../../lib/existingFiles';
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
 * The composer's chip, sent: it opens the file in the Files tab once the file
 * is known to exist, and stays a plain chip otherwise (a folder, a typo, an
 * `@` that was never a file).
 */
function SentPathChip({
  segment,
}: {
  segment: Exclude<UserMessageSegment, { kind: 'text' }>;
}): React.JSX.Element {
  const chatFiles = useContext(ChatFilesContext);
  const isDirectory = segment.kind === 'path' && segment.isDirectory;
  const absolutePath = useExistingFile(
    chatFiles?.cwd ?? '',
    chatFiles && !isDirectory ? segment.path : null,
  );
  const isReference = segment.kind === 'reference';
  const content = (
    <>
      {!isDirectory && <FileIcon path={segment.path} />}
      <span className="truncate">{isReference ? displayFileName(segment.path) : segment.path}</span>
    </>
  );

  if (!absolutePath || !chatFiles) {
    return (
      <span className={isReference ? REFERENCE_CHIP_CLASS : PATH_CHIP_CLASS} title={segment.path}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={isReference ? INTERACTIVE_REFERENCE_CHIP_CLASS : INTERACTIVE_PATH_CHIP_CLASS}
      title={absolutePath}
      onClick={() => chatFiles.onOpenFile(absolutePath)}
    >
      {content}
    </button>
  );
}

/**
 * A sent prompt with its `@` references and paths drawn as the composer drew
 * them. Search counts occurrences over the whole text, so each text run starts
 * its count after the matches before it, chips included.
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
    if (segment.kind !== 'text') return <SentPathChip key={segment.start} segment={segment} />;
    const before = query ? countMatches(text.slice(0, segment.start), query) : 0;
    const activeIndex = activeOccurrenceIndex === null ? null : activeOccurrenceIndex - before;
    return <span key={segment.start}>{highlightMatches(segment.text, query, activeIndex)}</span>;
  });
}
