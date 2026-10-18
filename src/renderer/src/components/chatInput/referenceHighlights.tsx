import { memo, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { cn } from '../../lib/utils';
import {
  buildChatReferenceSegments,
  findChatReferences,
  type ChatReferenceKind,
} from '../../lib/chatReferences';

/**
 * Reference labels use colour and a background only. Any metric change
 * (font-weight, padding, letter-spacing) would desync the transparent textarea
 * text from this layer and pull the caret out of place.
 */
const REFERENCE_STYLES: Record<ChatReferenceKind, string> = {
  skill: 'bg-[var(--system-accent)]/12 text-[var(--system-accent)]',
  file: 'bg-[var(--system-accent)]/10 text-[var(--system-accent)]',
};

interface ReferenceHighlightsProps {
  /** Current textarea text. */
  text: string;
  /** Commands the session exposes; only those get the skill label. */
  commandNames: ReadonlySet<string>;
  /** Textarea whose scroll position and layout this layer mirrors. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Typography and padding classes, copied from the textarea. */
  className?: string;
}

/**
 * Visible text layer behind a transparent textarea. Keeps every character in
 * its original position while styling reference tokens, so selection, caret
 * and IME composition stay native.
 */
export const ReferenceHighlights = memo(function ReferenceHighlights({
  text,
  commandNames,
  textareaRef,
  className,
}: ReferenceHighlightsProps): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(() => {
    const references = findChatReferences(text, commandNames);
    return buildChatReferenceSegments(text, references);
  }, [text, commandNames]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const content = contentRef.current;
    if (!textarea || !content) return;

    const syncScroll = (): void => {
      content.style.transform = `translateY(${-textarea.scrollTop}px)`;
    };
    syncScroll();
    textarea.addEventListener('scroll', syncScroll, { passive: true });
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, [textareaRef, text]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-0 select-none overflow-hidden text-foreground',
        className,
      )}
    >
      <div ref={contentRef} className="whitespace-pre-wrap [overflow-wrap:break-word]">
        {segments.map((segment) =>
          segment.reference ? (
            <span
              key={segment.start}
              className={cn(
                'rounded-[3px] box-decoration-clone',
                REFERENCE_STYLES[segment.reference.kind],
              )}
            >
              {text.slice(segment.start, segment.end)}
            </span>
          ) : (
            <span key={segment.start}>{text.slice(segment.start, segment.end)}</span>
          ),
        )}
        {/* Keeps a trailing newline visible, matching the textarea's final empty line. */}
        {'\u200b'}
      </div>
    </div>
  );
});
