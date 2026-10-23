import React, { useCallback, useState } from 'react';
import { IconPencil, IconQuote, IconTrash } from '@tabler/icons-react';
import { toast } from 'sonner';
import { useAppStore } from '../../state/appStore';
import { formatQuotesMessage, NO_QUOTES, type MessageQuote } from '../../lib/messageQuotes';
import { Button } from '../ui/button';
import OverflowClamp from '../message/overflowClamp';
import QuoteCommentEditor from './QuoteCommentEditor';

/** Four lines of quoted text before Show more. */
const QUOTE_TEXT_MAX_HEIGHT_PX = 88;

const QuoteCard = React.memo(function QuoteCard({
  quote,
  sessionPath,
}: {
  quote: MessageQuote;
  sessionPath: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);

  const handleSave = useCallback(
    (comment: string) => {
      useAppStore.getState().updateQuoteComment(sessionPath, quote.id, comment);
      setEditing(false);
    },
    [quote.id, sessionPath],
  );

  return (
    <li className="group relative flex flex-col gap-2 rounded-lg bg-muted/50 p-2.5 ring-[0.5px] ring-foreground/10">
      <button
        type="button"
        className="absolute -top-2 -right-2 z-10 flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-[0.5px] ring-foreground/15 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-destructive [-webkit-app-region:no-drag]"
        onClick={() => useAppStore.getState().removeQuote(sessionPath, quote.id)}
        aria-label="Delete quote"
        title="Delete quote"
      >
        <IconTrash className="size-3.5" />
      </button>
      <blockquote className="flex flex-col">
        <OverflowClamp
          maxHeight={QUOTE_TEXT_MAX_HEIGHT_PX}
          className="select-text whitespace-pre-wrap break-words text-[14px] leading-[22px] text-muted-foreground [overflow-wrap:anywhere]"
        >
          {quote.text}
        </OverflowClamp>
      </blockquote>
      {editing ? (
        <QuoteCommentEditor
          initialComment={quote.comment}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : quote.comment ? (
        <p
          className="whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground [overflow-wrap:anywhere]"
          onDoubleClick={() => setEditing(true)}
        >
          {quote.comment}
          <button
            type="button"
            className="ml-0.5 inline-flex size-6 items-center justify-center rounded-md align-top text-muted-foreground hover:bg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground [-webkit-app-region:no-drag]"
            onClick={() => setEditing(true)}
            aria-label="Edit comment"
            title="Edit comment"
          >
            <IconPencil className="size-[18px]" />
          </button>
        </p>
      ) : (
        <button
          type="button"
          className="text-left text-[15px] leading-6 text-muted-foreground italic hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          Add a comment...
        </button>
      )}
    </li>
  );
});

/**
 * The right sidebar's quotes tab: the session's collected quotes. Sending
 * turns them into one plain-text message (see formatQuotesMessage) and clears
 * the list.
 */
export default React.memo(function QuotePanel({
  sessionPath,
  onSend,
}: {
  sessionPath: string;
  /** Stable callback that sends a message like the chat input does. */
  onSend: (message: string) => Promise<void>;
}): React.JSX.Element {
  const quotes = useAppStore((state) => state.quotesBySession.get(sessionPath) ?? NO_QUOTES);
  const [sending, setSending] = useState(false);

  const handleSend = async (): Promise<void> => {
    const store = useAppStore.getState();
    // From the store, not the render: a comment being edited is saved by the
    // pointerdown that precedes this click.
    const sentQuotes = store.quotesBySession.get(sessionPath) ?? [];
    setSending(true);
    store.setSessionQuotes(sessionPath, []);
    try {
      await onSend(formatQuotesMessage(sentQuotes));
      store.setRightSidebarOpen(false);
    } catch (error) {
      console.error('Failed to send quotes:', error);
      const addedWhileSending = useAppStore.getState().quotesBySession.get(sessionPath) ?? [];
      store.setSessionQuotes(sessionPath, [...sentQuotes, ...addedWhileSending]);
      toast.error('Failed to send quotes. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col" data-testid="quote-panel">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {quotes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs leading-5 text-muted-foreground">
            <IconQuote className="size-5" />
            Select text in a message, then choose Quote to comment on it.
          </div>
        ) : (
          // A reading column, so a wide sidebar does not stretch quotes into long lines.
          <ol className="mx-auto flex max-w-160 flex-col gap-2">
            {quotes.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} sessionPath={sessionPath} />
            ))}
          </ol>
        )}
      </div>

      <div className="flex shrink-0 justify-center border-t-[0.5px] border-foreground/27 p-3">
        <Button
          type="button"
          className="w-3/5 max-w-60"
          disabled={quotes.length === 0 || sending}
          onClick={() => void handleSend()}
        >
          Send
        </Button>
      </div>
    </div>
  );
});
