import { useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { cn } from '../../lib/utils';
import { isValidTaskEmoji, useTaskEmojiStore } from '../../state/taskEmojiStore';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

/**
 * The task emoji picker, shared by the task row and the new-task input: the
 * caller brings the trigger as children, this owns the grid and closes itself
 * on a pick. The palette is user-managed — click picks, the hover X deletes,
 * dragging reorders, and the input at the bottom adds (paste or ⌃⌘Space).
 * Clicks in the content stop at the popover: on the task row the picker lives
 * inside the row's expand button, and React events bubble through the portal
 * into that button — a pick would otherwise toggle the row.
 */
export function TaskEmojiPicker({
  open,
  onOpenChange,
  current,
  onSelect,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The currently picked emoji; null shows a Remove row once one was picked. */
  current: string | null;
  onSelect: (emoji: string | null) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const emojis = useTaskEmojiStore((state) => state.emojis);
  const addEmoji = useTaskEmojiStore((state) => state.addEmoji);
  const removeEmoji = useTaskEmojiStore((state) => state.removeEmoji);
  const moveEmoji = useTaskEmojiStore((state) => state.moveEmoji);
  const [draft, setDraft] = useState('');
  const [addInvalid, setAddInvalid] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const pick = (emoji: string | null): void => {
    onSelect(emoji);
    onOpenChange(false);
  };

  const handleAdd = (): void => {
    const value = draft.trim();
    if (!isValidTaskEmoji(value)) {
      setAddInvalid(true);
      return;
    }
    addEmoji(value);
    setDraft('');
    setAddInvalid(false);
  };

  const endDrag = (): void => {
    setDragFrom(null);
    setDropTarget(null);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-48 p-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        {emojis.length === 0 ? (
          <div className="px-1 py-1 text-caption text-muted-foreground">
            No emojis yet — add one below.
          </div>
        ) : (
          <div className="grid max-h-44 grid-cols-5 gap-0.5 overflow-y-auto">
            {emojis.map((emoji, index) => (
              <div
                key={emoji}
                className="group/emoji relative"
                draggable
                onDragStart={(event) => {
                  setDragFrom(index);
                  // jsdom's synthetic drag events carry no dataTransfer.
                  if (event.dataTransfer !== null) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', emoji);
                  }
                }}
                onDragOver={(event) => {
                  if (dragFrom === null) return;
                  event.preventDefault();
                  setDropTarget(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragFrom !== null) moveEmoji(dragFrom, index);
                  endDrag();
                }}
                onDragEnd={endDrag}
              >
                <button
                  type="button"
                  data-checked={current === emoji || undefined}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-control text-lg hover:bg-muted data-checked:bg-accent-subtle',
                    dropTarget === index &&
                      dragFrom !== index &&
                      'ring-1 ring-[var(--system-accent)]',
                  )}
                  onClick={() => pick(emoji)}
                >
                  {emoji}
                </button>
                <button
                  type="button"
                  title={`Remove ${emoji} from the list`}
                  onClick={() => removeEmoji(emoji)}
                  className="absolute -top-1 -right-1 hidden size-3.5 items-center justify-center rounded-full bg-muted text-muted-foreground group-hover/emoji:flex hover:text-foreground focus-visible:flex"
                >
                  <IconX className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {current !== null && (
          <button
            type="button"
            className="mt-1 flex h-7 w-full items-center gap-1.5 rounded-control px-1.5 text-caption text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => pick(null)}
          >
            <IconX className="size-3.5" />
            Remove emoji
          </button>
        )}
        <div className="mt-1 border-t pt-1.5">
          <Input
            type="text"
            value={draft}
            placeholder="Add an emoji"
            aria-label="Add an emoji to the list"
            aria-invalid={addInvalid || undefined}
            title="Type or paste an emoji (⌃⌘Space); drag the grid to reorder"
            spellCheck={false}
            onChange={(event) => {
              setDraft(event.target.value);
              setAddInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === 'Process') return;
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
              }
            }}
            className="h-7"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
