import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ShortcutKbd } from '../../shortcuts/shortcutKbd';
import { Button } from '../ui/button';
import { PRIMARY_BUTTON_KBD_CLASS_NAME } from '../ui/kbd';
import { Textarea } from '../ui/textarea';

interface QuoteCommentEditorProps {
  initialComment: string;
  /** Enter, the Save button, or a pointer press outside the editor after the comment changed. */
  onSave: (comment: string) => void;
  /** Escape, or a pointer press outside the editor with the comment unchanged. */
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/** Comment input shared by the selection popover and the quote panel's edit mode. */
export default function QuoteCommentEditor({
  initialComment,
  onSave,
  onCancel,
  className,
  style,
}: QuoteCommentEditorProps): React.JSX.Element {
  const [comment, setComment] = useState(initialComment);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Continue an existing comment instead of typing in front of it.
  useEffect(() => {
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  // Clicking away (or on Send) keeps any change, including a cleared comment;
  // only Escape discards it.
  const handlePointerDownOutside = useEffectEvent((event: PointerEvent) => {
    if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
      const trimmed = comment.trim();
      if (trimmed === initialComment.trim()) {
        onCancel();
      } else {
        onSave(trimmed);
      }
    }
  });

  useEffect(() => {
    document.addEventListener('pointerdown', handlePointerDownOutside, true);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside, true);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || event.key === 'Process') {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSave(comment.trim());
    } else if (event.key === 'Escape') {
      // Keep Escape from reaching the window handlers (abort, search close).
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div ref={rootRef} className={cn('flex flex-col gap-2', className)} style={style}>
      <Textarea
        ref={textareaRef}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        aria-label="Quote comment"
        className="max-h-40 min-h-16 resize-none rounded-none border-0 bg-transparent px-1 py-0.5 text-body leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        type="button"
        size="xs"
        className="gap-1.5 self-end pr-1"
        onClick={() => onSave(comment.trim())}
      >
        Save
        <ShortcutKbd binding={{ key: 'Enter' }} className={PRIMARY_BUTTON_KBD_CLASS_NAME} />
      </Button>
    </div>
  );
}
