import { useContext, type ReactNode } from 'react';
import { localFileUrl } from '../../lib/chatAttachments';
import { useExistingFile } from '../../lib/existingFiles';
import { ChatFilesContext } from './chatFiles';

/** Opens an existing file in the Files tab; the href only makes it a real, focusable link. */
export function OpenFileAnchor({
  absolutePath,
  onOpenFile,
  children,
}: {
  absolutePath: string;
  onOpenFile: (absolutePath: string) => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <a
      href={localFileUrl(absolutePath)}
      title={absolutePath}
      onClick={(event) => {
        event.preventDefault();
        onOpenFile(absolutePath);
      }}
    >
      {children}
    </a>
  );
}

/** Chat text naming `path`: a link to the file once it is known to exist, plain text otherwise. */
export function FileLink({ path, children }: { path: string; children: ReactNode }): ReactNode {
  const chatFiles = useContext(ChatFilesContext);
  const absolutePath = useExistingFile(chatFiles?.cwd ?? '', chatFiles ? path : null);
  if (!chatFiles || !absolutePath) return children;
  return (
    <OpenFileAnchor absolutePath={absolutePath} onOpenFile={chatFiles.onOpenFile}>
      {children}
    </OpenFileAnchor>
  );
}
