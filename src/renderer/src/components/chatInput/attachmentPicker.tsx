import { useState } from 'react';
import { IconFile, IconPaperclip, IconPhoto, IconPlus, IconX } from '@tabler/icons-react';
import type { ChatAttachmentKind } from '../../../../shared/ipcContract';
import { InputGroupButton } from '../ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';
import {
  displayFileName,
  formatFileSize,
  MAX_PROMPT_ATTACHMENTS,
  type ChatAttachment,
} from '../../lib/chatAttachments';

export function AttachmentPickerButton({
  attachmentCount,
  disabled,
  onPick,
}: {
  attachmentCount: number;
  disabled?: boolean;
  onPick: (kind: ChatAttachmentKind) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isFull = attachmentCount >= MAX_PROMPT_ATTACHMENTS;

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
          disabled={disabled}
          data-testid="attachment-button"
          aria-label="Add attachments"
        >
          <IconPlus />
        </InputGroupButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={6} className="w-64 gap-0.5 p-1">
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
          onClick={() => pick('image')}
        >
          <IconPhoto className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Upload images</span>
        </button>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
          onClick={() => pick('file')}
        >
          <IconPaperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Upload files</span>
        </button>
        <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">
          {isFull
            ? `Maximum of ${MAX_PROMPT_ATTACHMENTS} attachments reached.`
            : `Paste or drop files (images: PNG, JPG, WebP, GIF). Up to ${MAX_PROMPT_ATTACHMENTS} per message.`}
        </p>
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
    <div className="flex w-full flex-wrap gap-2 px-3 pb-1 pt-0.5" data-testid="attachment-chips">
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
        'absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full',
        'border border-background bg-foreground text-background shadow-sm hover:bg-foreground/80',
      )}
      onClick={() => onRemove(attachment.id)}
      aria-label={`Remove ${attachment.name}`}
    >
      <IconX className="size-3" />
    </button>
  );

  if (attachment.kind === 'image') {
    return (
      <div className="relative size-16 shrink-0" title={attachment.name}>
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="size-16 rounded-xl border border-border/60 object-cover"
        />
        {removeButton}
      </div>
    );
  }

  return (
    <div
      className="relative flex max-w-56 shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-muted/50 py-1.5 pl-2 pr-6"
      title={attachment.path ?? attachment.name}
    >
      <IconFile className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate text-xs text-foreground">{displayFileName(attachment.name)}</div>
        {attachment.size > 0 && (
          <div className="text-[10px] leading-3 text-muted-foreground">
            {formatFileSize(attachment.size)}
          </div>
        )}
      </div>
      {removeButton}
    </div>
  );
}
