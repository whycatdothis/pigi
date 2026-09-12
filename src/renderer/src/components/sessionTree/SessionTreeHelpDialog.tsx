import React from 'react';
import {
  IconArrowsMinimize,
  IconBinaryTree,
  IconGitFork,
  IconHistory,
  IconQuestionMark,
} from '@tabler/icons-react';
import { cn } from '../../lib/utils';
import { useSessionTreeHelp } from './sessionTreeHelp';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

interface HelpPoint {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
}

const HELP_POINTS: HelpPoint[] = [
  {
    Icon: IconHistory,
    title: 'Jump anywhere in the history',
    body: 'Every message this session ever had is still here. Moving to an earlier one rewinds the conversation to that point — nothing is deleted, the messages you leave behind stay in the tree.',
  },
  {
    Icon: IconArrowsMinimize,
    title: 'Summarize the branch you leave, or skip it',
    body: 'When a jump would leave messages behind, pigi offers to summarize them into the context. Skipping is fine too: a summary only changes what the model sees, never the tree.',
  },
  {
    Icon: IconGitFork,
    title: 'Keep going from anywhere',
    body: 'The next message you send after a jump starts a new branch. From that branch you can jump to any node of any other branch at any time.',
  },
];

/**
 * Round "?" button. Sits next to the search field and at the right edge of the
 * tree tooltips; `onBeforeOpen` lets a tooltip close itself first.
 */
export function SessionTreeHelpButton({
  className,
  onBeforeOpen,
}: {
  className?: string;
  onBeforeOpen?: () => void;
}): React.JSX.Element {
  const { openHelp } = useSessionTreeHelp();
  return (
    <button
      type="button"
      aria-label="What is the session tree?"
      data-testid="session-tree-help-button"
      onClick={(event) => {
        event.stopPropagation();
        onBeforeOpen?.();
        openHelp();
      }}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <IconQuestionMark size={12} />
    </button>
  );
}

/** One instance, rendered by `App`. */
export default function SessionTreeHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" data-testid="session-tree-help">
        <DialogHeader className="gap-1">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <IconBinaryTree size={16} stroke={1.5} className="shrink-0 text-muted-foreground" />
            <span>Tree: a time machine for this session</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            What the session tree is for and how jumping between messages works.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {HELP_POINTS.map(({ Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon size={14} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{title}</span>
                <span className="text-[13px] leading-relaxed text-muted-foreground">{body}</span>
              </span>
            </div>
          ))}
        </div>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Hover a row for a preview, search or filter to find one, then click it (or press Enter) to
          move the session there.
        </p>
      </DialogContent>
    </Dialog>
  );
}
