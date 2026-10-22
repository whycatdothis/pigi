import React, { useCallback, useState } from 'react';
import { IconPencil, IconQuote, IconTrash } from '@tabler/icons-react';
import { toast } from 'sonner';
import { useAppStore } from '../../state/appStore';
import { formatQuotesMessage, NO_QUOTES, type MessageQuote } from '../../lib/messageQuotes';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import QuoteCommentEditor from './QuoteCommentEditor';

const ICON_BUTTON_CLASS_NAME =
  'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]';

const QuoteCard = React.memo(function QuoteCard({
  quote,
  sessionPath,
}: {
  quote: MessageQuote;
  sessionPath: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSave = useCallback(
    (comment: string) => {
      useAppStore.getState().updateQuoteComment(sessionPath, quote.id, comment);
      setEditing(false);
    },
    [quote.id, sessionPath],
  );

  return (
    <li className="group relative flex flex-col gap-2 rounded-lg bg-muted/50 p-2.5 ring-[0.5px] ring-foreground/10">
      <div className="absolute top-1.5 right-1.5 z-10 flex items-center rounded-md bg-muted/88 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          className={ICON_BUTTON_CLASS_NAME}
          onClick={() => setEditing(true)}
          aria-label="Edit comment"
          title="Edit comment"
        >
          <IconPencil className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(ICON_BUTTON_CLASS_NAME, 'hover:text-destructive')}
          onClick={() => useAppStore.getState().removeQuote(sessionPath, quote.id)}
          aria-label="Delete quote"
          title="Delete quote"
        >
          <IconTrash className="size-3.5" />
        </button>
      </div>
      <button
        type="button"
        className="text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <blockquote
          className={cn(
            'whitespace-pre-wrap break-words border-l-2 border-[var(--system-accent)] pl-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]',
            !expanded && 'line-clamp-4',
          )}
        >
          {quote.text}
        </blockquote>
      </button>
      {editing ? (
        <QuoteCommentEditor
          initialComment={quote.comment}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : quote.comment ? (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]">
          {quote.comment}
        </p>
      ) : (
        <button
          type="button"
          className="text-left text-[13px] leading-5 text-muted-foreground italic hover:text-foreground"
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
    const sentQuotes = [...quotes];
    const store = useAppStore.getState();
    setSending(true);
    store.setSessionQuotes(sessionPath, []);
    try {
      await onSend(formatQuotesMessage(sentQuotes));
      store.setRightSidebarOpen(false);
    } catch (error) {
      console.error('Failed to send quotes:', error);
      store.setSessionQuotes(sessionPath, sentQuotes);
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
          <ol className="flex flex-col gap-2">
            {quotes.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} sessionPath={sessionPath} />
            ))}
          </ol>
        )}
      </div>

      <div className="shrink-0 border-t-[0.5px] border-foreground/27 p-3">
        <Button
          type="button"
          className="w-full"
          disabled={quotes.length === 0 || sending}
          onClick={() => void handleSend()}
        >
          Send
        </Button>
      </div>
    </div>
  );
});
