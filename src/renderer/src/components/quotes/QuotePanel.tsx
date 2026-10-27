import React, { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { IconPencil, IconPlus, IconQuote, IconTrash } from '@tabler/icons-react';
import { toast } from 'sonner';
import type { ShortcutBinding } from '../../../../shared/ipcContract';
import { useAppStore } from '../../state/appStore';
import { bindingMatches } from '../../hooks/useKeyboardShortcuts';
import { formatQuotesMessage, NO_QUOTES, type MessageQuote } from '../../lib/messageQuotes';
import { ShortcutKbd } from '../../shortcuts/shortcutKbd';
import { Button } from '../ui/button';
import { PRIMARY_BUTTON_KBD_CLASS_NAME } from '../ui/kbd';
import OverflowClamp from '../message/overflowClamp';
import QuoteCommentEditor from './QuoteCommentEditor';

/** Four lines of quoted text before Show more. */
const QUOTE_TEXT_MAX_HEIGHT_PX = 88;

const CARD_CLASS_NAME =
  'group relative flex flex-col gap-2 rounded-surface-sm bg-muted/50 p-2.5 ring-[0.5px] ring-foreground/10';

function DeleteCardButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="absolute -top-2 -right-2 z-10 flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-[0.5px] ring-foreground/15 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-destructive [-webkit-app-region:no-drag]"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <IconTrash className="size-3.5" />
    </button>
  );
}

function CommentText({
  comment,
  onEdit,
}: {
  comment: string;
  onEdit: () => void;
}): React.JSX.Element {
  return (
    <p
      className="whitespace-pre-wrap break-words text-body leading-6 text-foreground [overflow-wrap:anywhere]"
      onDoubleClick={onEdit}
    >
      {comment}
      <button
        type="button"
        className="ml-0.5 inline-flex size-6 items-center justify-center rounded-control-sm align-top text-muted-foreground hover:bg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground [-webkit-app-region:no-drag]"
        onClick={onEdit}
        aria-label="Edit comment"
        title="Edit comment"
      >
        <IconPencil className="size-[18px]" />
      </button>
    </p>
  );
}

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
    <li className={CARD_CLASS_NAME}>
      <DeleteCardButton
        label="Delete quote"
        onClick={() => useAppStore.getState().removeQuote(sessionPath, quote.id)}
      />
      <blockquote className="flex flex-col">
        <OverflowClamp
          maxHeight={QUOTE_TEXT_MAX_HEIGHT_PX}
          className="select-text whitespace-pre-wrap break-words text-ui leading-[22px] text-muted-foreground [overflow-wrap:anywhere]"
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
        <CommentText comment={quote.comment} onEdit={() => setEditing(true)} />
      ) : (
        <button
          type="button"
          className="text-left text-body leading-6 text-muted-foreground italic hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          Add a comment...
        </button>
      )}
    </li>
  );
});

/** A plus under the quotes that opens straight into a comment on all of them. */
const GlobalCommentCard = React.memo(function GlobalCommentCard({
  sessionPath,
}: {
  sessionPath: string;
}): React.JSX.Element {
  const comment = useAppStore((state) => state.globalCommentBySession.get(sessionPath) ?? '');
  const [editing, setEditing] = useState(false);

  const handleSave = useCallback(
    (text: string) => {
      useAppStore.getState().setGlobalComment(sessionPath, text);
      setEditing(false);
    },
    [sessionPath],
  );

  if (!comment && !editing) {
    return (
      <button
        type="button"
        className="flex h-8 items-center justify-center gap-1.5 rounded-control text-caption text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        onClick={() => setEditing(true)}
      >
        <IconPlus className="size-4" />
        Add global comment
      </button>
    );
  }

  return (
    <div className={CARD_CLASS_NAME}>
      {!editing && (
        <DeleteCardButton
          label="Delete global comment"
          onClick={() => useAppStore.getState().setGlobalComment(sessionPath, '')}
        />
      )}
      <span className="text-caption leading-5 text-muted-foreground">Global comment</span>
      {editing ? (
        <QuoteCommentEditor
          initialComment={comment}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CommentText comment={comment} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
});

/**
 * The right sidebar's quotes tab: the session's collected quotes. Sending
 * turns them, and the global comment after them, into one plain-text message
 * (see formatQuotesMessage) and clears both.
 */
export default React.memo(function QuotePanel({
  sessionPath,
  onSend,
  sendShortcut,
}: {
  sessionPath: string;
  /** Stable callback that sends a message like the chat input does. */
  onSend: (message: string) => Promise<void>;
  sendShortcut: ShortcutBinding | undefined;
}): React.JSX.Element {
  const quotes = useAppStore((state) => state.quotesBySession.get(sessionPath) ?? NO_QUOTES);
  const hasGlobalComment = useAppStore((state) => state.globalCommentBySession.has(sessionPath));
  const [sending, setSending] = useState(false);

  const handleSend = async (): Promise<void> => {
    const store = useAppStore.getState();
    // From the store, not the render: a comment being edited is saved by the
    // pointerdown that precedes this click.
    const sentQuotes = store.quotesBySession.get(sessionPath) ?? [];
    const sentGlobalComment = store.globalCommentBySession.get(sessionPath) ?? '';
    setSending(true);
    store.setSessionQuotes(sessionPath, []);
    store.setGlobalComment(sessionPath, '');
    try {
      await onSend(formatQuotesMessage(sentQuotes, sentGlobalComment));
      store.setRightSidebarOpen(sessionPath, false);
    } catch (error) {
      console.error('Failed to send quotes:', error);
      const addedWhileSending = useAppStore.getState().quotesBySession.get(sessionPath) ?? [];
      store.setSessionQuotes(sessionPath, [...sentQuotes, ...addedWhileSending]);
      if (!useAppStore.getState().globalCommentBySession.has(sessionPath)) {
        store.setGlobalComment(sessionPath, sentGlobalComment);
      }
      toast.error('Failed to send quotes. Please try again.');
    } finally {
      setSending(false);
    }
  };
  const canSend = (quotes.length > 0 || hasGlobalComment) && !sending;

  // The panel stays mounted while the sidebar is closed, so the shortcut only
  // sends when the sidebar is open and the Send button can be seen.
  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!sendShortcut || event.isComposing || !bindingMatches(sendShortcut, event)) return;
    if (!canSend || !useAppStore.getState().openRightSidebarSessions.has(sessionPath)) return;
    event.preventDefault();
    void handleSend();
  });
  useEffect(() => {
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className="flex h-full w-full flex-col" data-testid="quote-panel">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        {quotes.length === 0 && !hasGlobalComment ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-caption leading-5 text-muted-foreground">
            <IconQuote className="size-5" />
            Select text in a message, then choose Quote to comment on it.
          </div>
        ) : (
          // A reading column, so a wide sidebar does not stretch quotes into long lines.
          <div className="mx-auto flex max-w-160 flex-col gap-2">
            {quotes.length > 0 && (
              <ol className="flex flex-col gap-2">
                {quotes.map((quote) => (
                  <QuoteCard key={quote.id} quote={quote} sessionPath={sessionPath} />
                ))}
              </ol>
            )}
            <GlobalCommentCard sessionPath={sessionPath} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 justify-center border-t-[0.5px] border-foreground/27 p-3">
        <Button
          type="button"
          className="w-3/5 max-w-60"
          disabled={!canSend}
          onClick={() => void handleSend()}
        >
          {/* The label is the button's only in-flow child, so it stays centered;
              the hint hangs off the label's trailing edge, out of flow, and no
              layout shifts when it fades in. */}
          <span className="relative inline-flex items-center">
            Send
            {sendShortcut && (
              <ShortcutKbd
                binding={sendShortcut}
                className={`${PRIMARY_BUTTON_KBD_CLASS_NAME} absolute inset-y-0 left-full my-auto ml-1.5 opacity-0 transition-opacity group-hover/button:opacity-100 group-focus-visible/button:opacity-100`}
              />
            )}
          </span>
        </Button>
      </div>
    </div>
  );
});
