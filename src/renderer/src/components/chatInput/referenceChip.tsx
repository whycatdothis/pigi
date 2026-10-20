import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { IconCube } from '@tabler/icons-react';
import { displayFileName } from '../../lib/chatAttachments';
import { referenceKindForTrigger } from '../../lib/composerContent';
import { slashCommandDisplayName } from '../../lib/slashCommands';
import { FileIcon } from '../fileIcon';

/** Inline chip for a `/command` or `@file` reference in the composer. */
export function ReferenceChip({ node }: ReactNodeViewProps): React.JSX.Element {
  const kind = referenceKindForTrigger(node.attrs.mentionSuggestionChar);
  const id = typeof node.attrs.id === 'string' ? node.attrs.id : '';

  return (
    <NodeViewWrapper
      as="span"
      title={id}
      data-reference-kind={kind}
      className="mx-px mt-px inline-flex h-5.5 max-w-60 items-center gap-1 rounded-[6px] bg-[var(--system-accent)]/10 px-1.5 align-top text-[0.875rem] text-[var(--system-accent)]"
    >
      {kind === 'file' ? <FileIcon path={id} /> : <IconCube className="size-4 shrink-0" />}
      <span className="truncate">
        {kind === 'file' ? displayFileName(id) : slashCommandDisplayName(id)}
      </span>
    </NodeViewWrapper>
  );
}
