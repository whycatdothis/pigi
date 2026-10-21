import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { displayFileName } from '../../lib/chatAttachments';
import { PATH_CHIP_CLASS } from '../../lib/referenceChipStyles';
import { FileIcon } from '../fileIcon';

/** Inline chip for a completed filesystem path. */
export function PathChip({ node }: ReactNodeViewProps): React.JSX.Element {
  const path = typeof node.attrs.id === 'string' ? node.attrs.id : '';
  const isDirectory = node.attrs.pathKind === 'directory';
  const label =
    typeof node.attrs.label === 'string' && node.attrs.label.length > 0
      ? node.attrs.label
      : displayFileName(path);

  return (
    <NodeViewWrapper
      as="span"
      title={path}
      data-path-kind={isDirectory ? 'directory' : 'file'}
      className={PATH_CHIP_CLASS}
    >
      {isDirectory ? null : <FileIcon path={path} />}
      <span className="truncate">{label}</span>
    </NodeViewWrapper>
  );
}
