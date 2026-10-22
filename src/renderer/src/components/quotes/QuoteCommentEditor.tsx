import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

interface QuoteCommentEditorProps {
  initialComment: string;
  onSave: (comment: string) => void;
  /** Escape or a pointer press outside the editor. */
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

  const handlePointerDownOutside = useEffectEvent((event: PointerEvent) => {
    if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
      onCancel();
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
        autoFocus
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        aria-label="Quote comment"
        className="max-h-40 min-h-16 resize-none rounded-none border-0 bg-transparent px-1 py-0.5 text-[13px] leading-5 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button type="button" size="xs" className="self-end" onClick={() => onSave(comment.trim())}>
        Save
      </Button>
    </div>
  );
}
