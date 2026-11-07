import { useContext, type ReactNode } from 'react';
import { localFileUrl } from '../../lib/chatAttachments';
import { useExistingFile } from '../../lib/existingPaths';
import { FileIcon } from '../fileIcon';
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

/** Leads a file link's text; sized to it. */
export function FileLinkIcon({ path }: { path: string }): React.JSX.Element {
  return (
    <FileIcon
      path={path}
      className="my-0 mr-0.5 inline-block size-[1em] rounded-none align-[-0.125em]"
    />
  );
}

/**
 * Chat text naming `path`: a link to the file once it is known to exist, plain
 * text otherwise. Inline code keeps the icon inside its box.
 */
export function FileLink({
  path,
  inlineCode = false,
  children,
}: {
  path: string;
  inlineCode?: boolean;
  children: ReactNode;
}): ReactNode {
  const chatFiles = useContext(ChatFilesContext);
  const absolutePath = useExistingFile(chatFiles?.cwd ?? '', chatFiles ? path : null);
  if (!chatFiles || !absolutePath) return inlineCode ? <code>{children}</code> : children;
  const content = (
    <>
      <FileLinkIcon path={absolutePath} />
      {children}
    </>
  );
  return (
    <OpenFileAnchor absolutePath={absolutePath} onOpenFile={chatFiles.onOpenFile}>
      {inlineCode ? <code>{content}</code> : content}
    </OpenFileAnchor>
  );
}
