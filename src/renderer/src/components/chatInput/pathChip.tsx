import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { IconFolder } from '@tabler/icons-react';
import { displayFileName } from '../../lib/chatAttachments';
import { REFERENCE_CHIP_CLASS } from '../../lib/referenceChipStyles';
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
      className={REFERENCE_CHIP_CLASS}
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
