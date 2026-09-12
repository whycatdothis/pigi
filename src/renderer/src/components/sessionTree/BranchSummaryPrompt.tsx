import React from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface BranchSummaryPromptProps {
  open: boolean;
  /** Entries that would leave the active path. */
  abandonedCount: number;
  /** Closing the prompt — Esc, or a click outside it — drops the whole move. */
  onCancel: () => void;
  onConfirm: (options: { summarize: boolean }) => void;
}

/**
 * Asked before a tree navigation drops part of the conversation.
 *
 * Only shown when entries are actually abandoned; moving within the active
 * branch never asks. It opens on top of the tree dialog rather than after it,
 * so the message the user picked is still on screen behind the question.
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
        <PromptBody abandonedCount={abandonedCount} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so its local state resets each time. */
function PromptBody({
  abandonedCount,
  onConfirm,
}: {
  abandonedCount: number;
  onConfirm: (options: { summarize: boolean }) => void;
}): React.JSX.Element {
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

      {/*
        Two answers, nothing else: summarizing is a yes/no about this move, and a
        cancel is the dialog's own close (Esc, or a click outside it). The accent
        marks the plain move — leaving is the default, summarizing the extra step.
      */}
      <DialogFooter className="gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onConfirm({ summarize: true })}
          data-testid="branch-summary-confirm"
        >
          Summarize
        </Button>
        <Button
          size="sm"
          // The theme's accent, not the app's neutral primary. The accent is dark
          // in light mode and light in dark mode, so the app's background colour
          // is what stays readable on it.
          className="bg-[var(--system-accent)] text-[var(--background)] hover:bg-[var(--system-accent)]/90"
          onClick={() => onConfirm({ summarize: false })}
          data-testid="branch-summary-skip"
        >
          Don&apos;t summarize
        </Button>
      </DialogFooter>
    </>
  );
}
