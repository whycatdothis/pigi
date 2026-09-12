import React, { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface BranchSummaryPromptProps {
  open: boolean;
  /** Entries that would leave the active path. */
  abandonedCount: number;
  onCancel: () => void;
  onConfirm: (options: { summarize: boolean; customInstructions?: string }) => void;
}

/**
 * Asked before a tree navigation drops part of the conversation.
 *
 * Only shown when entries are actually abandoned; moving within the active
 * branch never asks.
 */
export default function BranchSummaryPrompt({
  open,
  abandonedCount,
  onCancel,
  onConfirm,
}: BranchSummaryPromptProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="w-[460px]" data-testid="branch-summary-prompt">
        <PromptBody abandonedCount={abandonedCount} onCancel={onCancel} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so its local state resets each time. */
function PromptBody({
  abandonedCount,
  onCancel,
  onConfirm,
}: {
  abandonedCount: number;
  onCancel: () => void;
  onConfirm: (options: { summarize: boolean; customInstructions?: string }) => void;
}): React.JSX.Element {
  const [customOpen, setCustomOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (customOpen) inputRef.current?.focus();
  }, [customOpen]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-sm">Leave this branch?</DialogTitle>
        <DialogDescription className="text-[13px]">
          {abandonedCount === 1
            ? 'One message leaves the conversation.'
            : `${abandonedCount} messages leave the conversation.`}{' '}
          They stay in the session tree and can be returned to at any time.
        </DialogDescription>
      </DialogHeader>

      {customOpen && (
        <textarea
          ref={inputRef}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={3}
          placeholder="What should the summary focus on?"
          className="w-full resize-none rounded-md border border-border bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring"
        />
      )}

      <DialogFooter className="gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {!customOpen && (
          <Button variant="ghost" size="sm" onClick={() => setCustomOpen(true)}>
            Custom focus…
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onConfirm({ summarize: false })}
          data-testid="branch-summary-skip"
        >
          Don&apos;t summarize
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onConfirm({ summarize: true, customInstructions: instructions.trim() || undefined })
          }
          data-testid="branch-summary-confirm"
        >
          Summarize
        </Button>
      </DialogFooter>
    </>
  );
}
