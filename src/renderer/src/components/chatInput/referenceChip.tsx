import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { IconCube, IconTerminal2 } from '@tabler/icons-react';
import { displayFileName } from '../../lib/chatAttachments';
import type { ChatReferenceKind } from '../../lib/chatReferences';
import { referenceKindForTrigger } from '../../lib/composerContent';
import { REFERENCE_CHIP_CLASS } from '../../lib/referenceChipStyles';
import { isSkillCommandName, slashCommandDisplayName } from '../../lib/slashCommands';
import { FileIcon } from '../fileIcon';

/** Matches the transcript: skills show a cube, other commands a terminal. */
function ReferenceIcon({ kind, id }: { kind: ChatReferenceKind; id: string }): React.JSX.Element {
  if (kind === 'file') return <FileIcon path={id} />;
  if (isSkillCommandName(id)) return <IconCube className="size-4 shrink-0" />;
  return <IconTerminal2 className="size-4 shrink-0" />;
}

/** Inline chip for a `/command` or `@file` reference in the composer. */
export function ReferenceChip({ node }: ReactNodeViewProps): React.JSX.Element {
  const kind = referenceKindForTrigger(node.attrs.mentionSuggestionChar);
  const id = typeof node.attrs.id === 'string' ? node.attrs.id : '';

  return (
    <NodeViewWrapper
      as="span"
      title={id}
      data-reference-kind={kind}
      className={REFERENCE_CHIP_CLASS}
    >
      <ReferenceIcon kind={kind} id={id} />
      <span className="truncate">
        {kind === 'file' ? displayFileName(id) : slashCommandDisplayName(id)}
      </span>
    </NodeViewWrapper>
  );
}
