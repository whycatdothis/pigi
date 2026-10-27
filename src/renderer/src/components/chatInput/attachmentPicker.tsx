import { useState } from 'react';
import { IconPaperclip, IconPhoto, IconPlus, IconX } from '@tabler/icons-react';
import type { ChatAttachmentKind } from '../../../../shared/ipcContract';
import { InputGroupButton } from '../ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';
import { FileIcon } from '../fileIcon';
import { displayFileName, formatFileSize, type ChatAttachment } from '../../lib/chatAttachments';

export function AttachmentPickerButton({
  onPick,
}: {
  onPick: (kind: ChatAttachmentKind) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const pick = (kind: ChatAttachmentKind): void => {
    setOpen(false);
    onPick(kind);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <InputGroupButton
          size="icon-sm"
          variant="ghost"
          className="shrink-0 rounded-full"
          data-testid="attachment-button"
          aria-label="Add attachments"
        >
          <IconPlus />
        </InputGroupButton>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-fit gap-0.5 rounded-surface bg-popover/50 p-1 backdrop-blur-md"
      >
        <button
          type="button"
          className="flex items-center gap-2 rounded-control-sm px-2 py-1 text-left text-xs hover:bg-muted"
          onClick={() => pick('image')}
        >
          <IconPhoto className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1">Upload images</span>
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-control-sm px-2 py-1 text-left text-xs hover:bg-muted"
          onClick={() => pick('file')}
        >
          <IconPaperclip className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1">Upload files</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}): React.JSX.Element {
  return (
    <div
      className="flex w-full flex-wrap items-start gap-2 px-3 pb-1 pt-0.5"
      data-testid="attachment-chips"
    >
      {attachments.map((attachment) => (
        <AttachmentChip key={attachment.id} attachment={attachment} onRemove={onRemove} />
      ))}
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: (id: string) => void;
}): React.JSX.Element {
  const removeButton = (
    <button
      type="button"
      className={cn(
        'absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full',
        'border border-background bg-[var(--system-accent)] text-[var(--background)] shadow-sm hover:bg-[var(--system-accent)]/90',
        'opacity-0 transition-opacity group-hover/chip:opacity-100 focus-visible:opacity-100',
      )}
      onClick={() => onRemove(attachment.id)}
      aria-label={`Remove ${attachment.name}`}
    >
      <IconX className="size-2.5" stroke={3} />
    </button>
  );

  if (attachment.kind === 'image') {
    return (
      <div className="group/chip relative size-16 shrink-0" title={attachment.name}>
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="size-16 rounded-chip border border-border/60 object-cover"
        />
        {removeButton}
      </div>
    );
  }

  return (
    <div
      className="group/chip relative flex max-w-56 shrink-0 items-center gap-1.5 rounded-chip border border-border/60 bg-muted/50 py-1 pl-1.5 pr-3"
      title={attachment.path ?? attachment.name}
    >
      <FileIcon path={attachment.name} />
      <div className="min-w-0">
        <div className="truncate text-xs text-foreground">{displayFileName(attachment.name)}</div>
        {attachment.size > 0 && (
          <div className="text-3xs leading-3 text-muted-foreground">
            {formatFileSize(attachment.size)}
          </div>
        )}
      </div>
      {removeButton}
    </div>
  );
}
