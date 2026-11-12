import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { isTextField } from '../../lib/focusModality';
import { VIBRANCY_OVERLAY_CONTENT } from '../../lib/layoutConstants';
import { openQuoteEditorSaves } from '../../lib/openQuoteEditors';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

/** The editor floating over a view: the selection popover's and the Git tab's file comment. */
export const FLOATING_QUOTE_EDITOR_WIDTH_PX = 320;
export const FLOATING_QUOTE_EDITOR_CLASS_NAME = cn(
  VIBRANCY_OVERLAY_CONTENT,
  'absolute z-20 p-2 animate-in fade-in-0 zoom-in-95',
);

interface QuoteCommentEditorProps {
  initialComment: string;
  /**
   * Enter, the Save button, or with the comment changed: Send, the editor
   * unmounting (the view under it switched), or (without
   * `keepOpenOnOutsidePress`) a press outside.
   */
  onSave: (comment: string) => void;
  /** Escape, or a press outside the editor with the comment unchanged. */
  onCancel: () => void;
  /**
   * A press outside with a changed comment leaves the editor open instead of
   * saving: a floating editor stays over the text it quotes.
   */
  keepOpenOnOutsidePress?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Comment input shared by the selection popover and the quote panel's edit mode. */
export default function QuoteCommentEditor({
  initialComment,
  onSave,
  onCancel,
  keepOpenOnOutsidePress = false,
  className,
  style,
}: QuoteCommentEditorProps): React.JSX.Element {
  const [comment, setComment] = useState(initialComment);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closedRef = useRef(false);

  const save = (text: string): void => {
    closedRef.current = true;
    onSave(text);
  };
  const cancel = (): void => {
    closedRef.current = true;
    onCancel();
  };

  // Continue an existing comment instead of typing in front of it.
  useEffect(() => {
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  // In the quote panel, clicking away (or on Send) keeps any change, including
  // a cleared comment; only Escape discards it.
  const handlePointerDownOutside = useEffectEvent((event: PointerEvent) => {
    if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
      const trimmed = comment.trim();
      if (trimmed === initialComment.trim()) {
        cancel();
      } else if (!keepOpenOnOutsidePress) {
        save(trimmed);
      }
    }
  });

  // An editor left open after a click in its view still takes Escape there,
  // which would otherwise reach the window handlers and abort a running agent.
  // Only there: a menu or dialog elsewhere must still get its Escape.
  const handleKeyDownOutside = useEffectEvent((event: KeyboardEvent) => {
    const view = rootRef.current?.parentElement;
    if (
      event.key === 'Escape' &&
      !event.isComposing &&
      event.target instanceof Node &&
      view?.contains(event.target) &&
      !isTextField(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  });

  const saveIfChanged = useEffectEvent(() => {
    const trimmed = comment.trim();
    if (!closedRef.current && trimmed !== initialComment.trim()) {
      save(trimmed);
    }
  });

  useEffect(() => {
    document.addEventListener('pointerdown', handlePointerDownOutside, true);
    document.addEventListener('keydown', handleKeyDownOutside, true);
    const saveForSend = (): void => saveIfChanged();
    openQuoteEditorSaves.add(saveForSend);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside, true);
      document.removeEventListener('keydown', handleKeyDownOutside, true);
      openQuoteEditorSaves.delete(saveForSend);
      saveIfChanged();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || event.key === 'Process') {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      save(comment.trim());
    } else if (event.key === 'Escape') {
      // Keep Escape from reaching the window handlers (abort, search close).
      event.preventDefault();
      event.stopPropagation();
      cancel();
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
        variant="outline"
        size="sm"
        className="self-end"
        onClick={() => save(comment.trim())}
      >
        Save
      </Button>
    </div>
  );
}
