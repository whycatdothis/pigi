import React, { useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { cn } from '../lib/utils';
import MarkdownMessage from './markdownMessage';

/**
 * Branch summary left behind by a summarizing tree navigation: the conclusions
 * of the branch that was left. Collapsed by default — it is context for the
 * model, not something to read on every turn.
 */
export default function BranchSummaryCard({ text }: { text: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="py-2" data-testid="branch-summary">
      <div className="mx-auto w-full rounded-lg border border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronRight
            size={13}
            className={cn('shrink-0 transition-transform', open && 'rotate-90')}
          />
          <span>Branch summary</span>
        </button>
        {open && (
          <div className="max-h-80 overflow-y-auto px-3 pb-2 text-[13px] text-foreground/80">
            <MarkdownMessage text={text} />
          </div>
        )}
      </div>
    </div>
  );
}
