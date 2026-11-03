import { memo } from 'react';
import { IconFolderOpen, IconGitCompare, IconLoader2 } from '@tabler/icons-react';
import type { GitDiffSource } from '../../../../shared/ipcContract';
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

function CenteredMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-caption text-muted-foreground">
      {children}
    </div>
  );
}

/** Fades in late, so a load that finishes quickly never flashes a spinner. */
function CenteredLoading({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 animate-in items-center justify-center gap-2 text-caption text-muted-foreground delay-300 fade-in-0 fill-mode-backwards">
      <SpinningIcon>
        <IconLoader2 size={14} />
      </SpinningIcon>
      {label}
    </div>
  );
}

/** The Diff tab: one file's diff at a time, chosen from the sidebar. */
// App re-renders on every streamed agent batch; the workspace and the other
// props are stable, so the Diff tab skips those renders.
const GitDiffTab = memo(function GitDiffTab({
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

  const { summary, status, error, selection, commitFiles } = workspace;
  const commit = selection?.commit
    ? (summary?.commits.find((item) => item.hash === selection.commit) ??
      summary?.baseCommits.find((item) => item.hash === selection.commit))
    : undefined;
  const commitState = selection?.commit ? commitFiles.get(selection.commit) : undefined;
  const files = selection?.commit
    ? commitState?.status === 'ready'
      ? commitState.files
      : []
    : (summary?.files ?? []);
  const selectedFile = files.find((file) => file.path === selection?.path) ?? null;

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

  if (summary.files.length === 0 && !selection?.commit) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconGitCompare />
          </EmptyMedia>
          <EmptyTitle>No changes</EmptyTitle>
          <EmptyDescription>
            {workspace.mode === 'uncommitted'
              ? 'The working tree matches HEAD.'
              : workspace.mode === 'lastCommit'
                ? 'The last commit changes no files.'
                : `No changes against ${summary.baseLabel}.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!selectedFile) {
    if (commitState?.status === 'error') {
      return <CenteredMessage>{commitState.error}</CenteredMessage>;
    }
    if (commitState?.status === 'ready') {
      return <CenteredMessage>This commit changes no files.</CenteredMessage>;
    }
    return <CenteredLoading label="Loading changes…" />;
  }

  const source: GitDiffSource = selection?.commit
    ? { kind: 'commit', commit: selection.commit }
    : summary.source;
  return (
    <GitDiffViewer
      projectPath={projectPath}
      source={source}
      compareLabel={
        selection?.commit
          ? `${commit?.shortHash ?? selection.commit.slice(0, 7)} ${commit?.subject ?? ''}`.trim()
          : workspace.mode === 'uncommitted'
            ? 'Uncommitted changes'
            : workspace.mode === 'lastCommit'
              ? `Last commit ${summary.baseLabel}`
              : `vs ${summary.baseLabel}`
      }
      file={selectedFile}
      layout={workspace.layout}
      onLayoutChange={workspace.setLayout}
      sessionPath={sessionPath}
    />
  );
});

export default GitDiffTab;
