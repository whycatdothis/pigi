import { memo } from 'react';
import { IconFolderOpen, IconGitCompare, IconLoader2 } from '@tabler/icons-react';
import type { GitDiffCommit, GitDiffSource } from '../../../../shared/ipcContract';
import type { GitDiffMode, GitSelection, GitWorkspace } from '../../hooks/useGitWorkspace';
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

/** What the open diff compares, for the viewer's header. */
function compareLabel(
  selection: GitSelection | null,
  commit: GitDiffCommit | undefined,
  mode: GitDiffMode,
  baseLabel: string,
): string {
  if (selection?.list === 'commit') {
    return `${commit?.shortHash ?? selection.commit.slice(0, 7)} ${commit?.subject ?? ''}`.trim();
  }
  if (selection?.list === 'staged') return 'Staged changes';
  if (selection?.list === 'unstaged') return 'Unstaged changes';
  if (mode === 'uncommitted') return 'Uncommitted changes';
  if (mode === 'lastCommit') return `Last commit ${baseLabel}`;
  return `vs ${baseLabel}`;
}

/** The Git tab: one file's diff at a time, chosen from the sidebar. */
// App re-renders on every streamed agent batch; the workspace and the other
// props are stable, so the Git tab skips those renders.
const GitTab = memo(function GitTab({
  projectPath,
  sessionProjectPath,
  sessionPath,
  workspace,
  onOpenProject,
}: {
  projectPath: string | null;
  /** The session's own project; another project's quotes need absolute references. */
  sessionProjectPath: string | null;
  sessionPath: string | null;
  workspace: GitWorkspace;
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
  const selectedCommit = selection?.list === 'commit' ? selection.commit : null;
  const commit = selectedCommit
    ? (summary?.commits.find((item) => item.hash === selectedCommit) ??
      summary?.baseCommits.find((item) => item.hash === selectedCommit))
    : undefined;
  const commitState = selectedCommit ? commitFiles.get(selectedCommit) : undefined;
  const files =
    selection?.list === 'commit'
      ? commitState?.status === 'ready'
        ? commitState.files
        : []
      : summary
        ? summary[selection?.list ?? 'files']
        : [];
  const statusView = workspace.view === 'status';
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

  const noChanges = statusView
    ? summary.staged.length === 0 && summary.unstaged.length === 0
    : summary.files.length === 0 && !selectedCommit;
  if (noChanges) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconGitCompare />
          </EmptyMedia>
          <EmptyTitle>No changes</EmptyTitle>
          <EmptyDescription>
            {statusView || workspace.mode === 'uncommitted'
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

  const list = selection?.list ?? 'files';
  const source: GitDiffSource = selectedCommit
    ? { kind: 'commit', commit: selectedCommit }
    : list === 'staged' || list === 'unstaged'
      ? { kind: list }
      : summary.source;
  return (
    <GitDiffViewer
      projectPath={projectPath}
      sessionProjectPath={sessionProjectPath}
      source={source}
      baseLabel={summary.baseLabel}
      branch={summary.branch}
      compareLabel={compareLabel(selection, commit, workspace.mode, summary.baseLabel)}
      file={selectedFile}
      layout={workspace.layout}
      onLayoutChange={workspace.setLayout}
      sessionPath={sessionPath}
    />
  );
});

export default GitTab;
