import { useContext, type ReactNode } from 'react';
import { localFileUrl } from '../../lib/chatAttachments';
import { useExistingFile } from '../../lib/existingPaths';
import type { FileLocation } from '../../lib/filePathCandidates';
import { INTERACTIVE_PATH_CHIP_CLASS } from '../../lib/referenceChipStyles';
import { FileIcon } from '../fileIcon';
import { ChatFilesContext } from './chatFiles';

/**
 * Chat text naming a file, drawn as the sent prompt's path chip once the file
 * is known to exist and left as `fallback` otherwise. An anchor rather than a
 * button, so the path stays in a text selection; the href only makes it a
 * real, focusable link.
 */
export function FileLink({
  location,
  fallback,
  children,
}: {
  location: FileLocation;
  fallback: ReactNode;
  children: ReactNode;
}): ReactNode {
  const chatFiles = useContext(ChatFilesContext);
  const absolutePath = useExistingFile(chatFiles?.cwd ?? '', chatFiles ? location.path : null);
  if (!chatFiles || !absolutePath) return fallback;
  return (
    <a
      href={localFileUrl(absolutePath)}
      title={absolutePath}
      className={INTERACTIVE_PATH_CHIP_CLASS}
      onClick={(event) => {
        event.preventDefault();
        chatFiles.onOpenFile(absolutePath, location.lines);
      }}
    >
      {/* Out of reach of the `.markdown-body img` margin and radius. */}
      <FileIcon path={absolutePath} className="my-0 rounded-none" />
      <span className="truncate">{children}</span>
    </a>
  );
}
