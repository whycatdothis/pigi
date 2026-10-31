import { IconGitCompare } from '@tabler/icons-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty';

/** Placeholder for the Diff tab; the changed-file view lands here next. */
export default function GitDiffTab(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <Empty>
        <EmptyHeader>
          <IconGitCompare size={24} className="mx-auto text-muted-foreground" />
          <EmptyTitle className="text-lg">Git diff</EmptyTitle>
          <EmptyDescription>Changed files will appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
