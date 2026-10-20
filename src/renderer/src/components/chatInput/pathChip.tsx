import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { IconFolder } from '@tabler/icons-react';
import { displayFileName } from '../../lib/chatAttachments';
import { FileIcon } from '../fileIcon';

/** Inline chip for a completed filesystem path. */
export function PathChip({ node }: ReactNodeViewProps): React.JSX.Element {
  const path = typeof node.attrs.id === 'string' ? node.attrs.id : '';
  const isDirectory = node.attrs.pathKind === 'directory';

  return (
    <NodeViewWrapper
      as="span"
      title={path}
      data-path-kind={isDirectory ? 'directory' : 'file'}
      className="mx-px mt-px inline-flex h-5.5 max-w-60 items-center gap-1 rounded-[6px] bg-[var(--system-accent)]/10 px-1.5 align-top text-[0.875rem] text-[var(--system-accent)]"
    >
      {isDirectory ? (
        <IconFolder className="size-4 shrink-0" strokeWidth={1.75} />
      ) : (
        <FileIcon path={path} />
      )}
      <span className="truncate">{displayFileName(path)}</span>
    </NodeViewWrapper>
  );
}
