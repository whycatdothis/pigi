import { IconFolderOpen, IconGitCompare, IconLoader2 } from '@tabler/icons-react';
import type { GitDiffWorkspace } from '../../hooks/useGitDiffWorkspace';
import { Button } from '../ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/empty';
import { SpinningIcon } from '../ui/spinningIcon';
import GitDiffViewer from './GitDiffViewer';

function CenteredLoading({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-caption text-muted-foreground">
      <SpinningIcon>
        <IconLoader2 size={14} />
      </SpinningIcon>
      {label}
    </div>
  );
}

/** The Diff tab: one file's diff at a time, chosen from the sidebar. */
export default function GitDiffTab({
  projectPath,
  sessionPath,
  workspace,
  onOpenProject,
}: {
  projectPath: string | null;
  sessionPath: string | null;
  workspace: GitDiffWorkspace;
  onOpenProject: () => void;
}): React.JSX.Element {
  if (!projectPath) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconFolderOpen />
          </EmptyMedia>
          <EmptyTitle>No project open</EmptyTitle>
          <EmptyDescription>Open a project to review its Git changes.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onOpenProject}>
            <IconFolderOpen data-icon="inline-start" />
            Open project
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const { summary, status, error, selectedPath } = workspace;
  const selectedFile = summary?.files.find((file) => file.path === selectedPath) ?? null;

  if (status === 'error') {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconGitCompare />
          </EmptyMedia>
          <EmptyTitle>Unable to read this diff</EmptyTitle>
          <EmptyDescription>{error ?? 'Git returned an error.'}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={workspace.resetBase}>
            Reset comparison
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (!summary || (status === 'loading' && !selectedFile)) {
    return <CenteredLoading label="Loading changes…" />;
  }

  if (summary.files.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconGitCompare />
          </EmptyMedia>
          <EmptyTitle>No changes</EmptyTitle>
          <EmptyDescription>
            {summary.base === 'HEAD'
              ? 'The working tree matches HEAD.'
              : `No changes against ${summary.baseLabel}.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!selectedFile) {
    return <CenteredLoading label="Loading changes…" />;
  }

  return (
    <GitDiffViewer
      key={`${summary.mergeBase}:${selectedFile.path}`}
      projectPath={projectPath}
      base={summary.mergeBase}
      baseLabel={summary.baseLabel}
      file={selectedFile}
      sessionPath={sessionPath}
      onRefresh={workspace.refresh}
    />
  );
}
