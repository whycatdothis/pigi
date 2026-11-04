import { memo, useEffect, useMemo, useState } from 'react';
import { IconChevronRight, IconLoader2 } from '@tabler/icons-react';
import { FolderClosed, FolderOpen, Minus, Plus } from 'lucide-react';
import type {
  GitDiffCommit,
  GitDiffFile,
  GitDiffSummary,
  ShortcutBinding,
} from '../../../../shared/ipcContract';
import type {
  GitFileList,
  GitSection,
  GitSelection,
  GitView,
  GitWorkspace,
} from '../../hooks/useGitWorkspace';
import { GIT_DIFF_STATUS_BADGES } from '../../lib/gitDiffLabels';
import { buildGitDiffTree, type GitDiffTreeDirectory } from '../../lib/gitDiffTree';
import { cn, formatTimeAgo } from '../../lib/utils';
import { SidebarToggle } from '../sidebar/sidebarToggle';
import { FileIcon } from '../fileIcon';
import { SpinningIcon } from '../ui/spinningIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Sidebar as ShadcnSidebar, SidebarContent, SidebarHeader } from '../ui/sidebar';
import GitBasePicker from './GitBasePicker';
import GitDiffModeMenu from './GitDiffModeMenu';
import SegmentedToggle from './SegmentedToggle';

const INDENT_STEP_PX = 12;
const ROW_CLASS_NAME =
  'flex h-7 w-full items-center gap-1.5 rounded-control pr-2 text-left text-body transition-colors';
const ROW_IDLE_CLASS_NAME =
  'text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground';
const ROW_SELECTED_CLASS_NAME = 'bg-accent-subtle text-[var(--system-accent)]';

const VIEW_LABELS: { value: GitView; label: string }[] = [
  { value: 'status', label: 'Git status' },
  { value: 'diff', label: 'Diff' },
  { value: 'commits', label: 'Commits' },
];

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
}

function FileRow({
  file,
  depth,
  showDirectory,
  selected,
  onSelect,
}: {
  file: GitDiffFile;
  depth: number;
  /** Flat lists name the file and dim its folder; the tree already shows folders. */
  showDirectory: boolean;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  const directory = showDirectory ? parentPath(file.path) : '';
  return (
    <li>
      <button
        type="button"
        data-diff-path={file.path}
        style={{ paddingLeft: `${depth * INDENT_STEP_PX + 6}px` }}
        className={cn(ROW_CLASS_NAME, selected ? ROW_SELECTED_CLASS_NAME : ROW_IDLE_CLASS_NAME)}
        title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        onClick={onSelect}
      >
        <span className="size-3 shrink-0" />
        <FileIcon path={file.path} className="size-4" />
        <span className="min-w-0 flex-1 truncate">
          {fileName(file.path)}
          {directory && (
            <span className="ml-1.5 text-caption text-muted-foreground">{directory}</span>
          )}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {GIT_DIFF_STATUS_BADGES[file.status]}
        </span>
        {file.binary ? (
          <span className="shrink-0 text-2xs text-muted-foreground">binary</span>
        ) : (
          <span className="flex shrink-0 gap-1 text-2xs tabular-nums">
            <span className="text-success-fg">+{file.additions}</span>
            <span className="text-danger-fg">-{file.deletions}</span>
          </span>
        )}
      </button>
    </li>
  );
}

function DirectoryTree({
  directory,
  depth,
  collapsed,
  onToggle,
  selectedPath,
  onSelectFile,
}: {
  directory: GitDiffTreeDirectory;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}): React.JSX.Element {
  const isExpanded = !collapsed.has(directory.path);
  return (
    <li>
      <button
        type="button"
        aria-expanded={isExpanded}
        style={{ paddingLeft: `${depth * INDENT_STEP_PX + 6}px` }}
        className={cn(ROW_CLASS_NAME, ROW_IDLE_CLASS_NAME)}
        onClick={() => onToggle(directory.path)}
      >
        <IconChevronRight
          size={12}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90',
          )}
        />
        {isExpanded ? (
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{directory.name}</span>
      </button>
      {isExpanded && (
        <ul>
          {directory.directories.map((child) => (
            <DirectoryTree
              key={child.path}
              directory={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
          {directory.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              depth={depth + 1}
              showDirectory={false}
              selected={file.path === selectedPath}
              onSelect={() => onSelectFile(file.path)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** List items for `files`, as folders or as one flat list; the caller supplies the `<ul>`. */
function FileList({
  files,
  fileList,
  selectedPath,
  onSelectFile,
}: {
  files: GitDiffFile[];
  fileList: GitFileList;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}): React.JSX.Element {
  const tree = useMemo(() => buildGitDiffTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggleDirectory(path: string): void {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  if (fileList === 'flat') {
    return (
      <>
        {files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            depth={0}
            showDirectory
            selected={file.path === selectedPath}
            onSelect={() => onSelectFile(file.path)}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {tree.directories.map((directory) => (
        <DirectoryTree
          key={directory.path}
          directory={directory}
          depth={0}
          collapsed={collapsed}
          onToggle={toggleDirectory}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
      {tree.files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          depth={0}
          showDirectory={false}
          selected={file.path === selectedPath}
          onSelect={() => onSelectFile(file.path)}
        />
      ))}
    </>
  );
}

const FILE_LISTS: readonly { value: GitFileList; label: string }[] = [
  { value: 'tree', label: 'Tree' },
  { value: 'flat', label: 'Flatten' },
];

/** The selected path, when the selection is in `list` (and in `commit`, for a commit's files). */
function selectedPathIn(
  selection: GitSelection | null,
  list: GitSelection['list'],
  commit?: string,
): string | null {
  if (!selection || selection.list !== list) return null;
  if (selection.list === 'commit' && selection.commit !== commit) return null;
  return selection.path;
}

function Section({
  section,
  label,
  count,
  more = false,
  emptyText,
  action,
  workspace,
  children,
}: {
  section: GitSection;
  label: string;
  count: number;
  /** The list stops at a cap and more exist past it. */
  more?: boolean;
  emptyText: string;
  /** A button for the whole group, at the right end of its header. */
  action?: React.ReactNode;
  workspace: GitWorkspace;
  children: React.ReactNode;
}): React.JSX.Element {
  const open = !workspace.collapsedSections.has(section);
  return (
    <div>
      <div className="flex items-center pt-2 pb-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => workspace.toggleSection(section)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-control px-1.5 text-left text-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronRight
            size={12}
            className={cn('shrink-0 transition-transform', open && 'rotate-90')}
          />
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{label}</span>
            {count > 0 && (
              // bg-muted is the sidebar's own color, so the pill would not show.
              <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-px text-2xs leading-4">
                {count}
                {more && '+'}
              </span>
            )}
          </span>
        </button>
        {action}
      </div>
      {open &&
        (count === 0 ? (
          <p className="py-1 pr-2 pl-6 text-caption text-muted-foreground/70">{emptyText}</p>
        ) : (
          <ul>{children}</ul>
        ))}
    </div>
  );
}

function StatusView({
  summary,
  workspace,
}: {
  summary: GitDiffSummary;
  workspace: GitWorkspace;
}): React.JSX.Element {
  const groups: {
    section: 'staged' | 'unstaged';
    label: string;
    files: GitDiffFile[];
    action: string;
    icon: React.ReactNode;
  }[] = [
    {
      section: 'staged',
      label: 'Staged',
      files: summary.staged,
      action: 'Unstage all',
      icon: <Minus className="size-3.5" />,
    },
    {
      section: 'unstaged',
      label: 'Unstaged',
      files: summary.unstaged,
      action: 'Stage all',
      icon: <Plus className="size-3.5" />,
    },
  ];

  return (
    <TooltipProvider delayDuration={400}>
      <div className="pb-2">
        {groups.map((group) => (
          <Section
            key={group.section}
            section={group.section}
            label={group.label}
            count={group.files.length}
            emptyText={`No ${group.label.toLowerCase()} files.`}
            action={
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={group.action}
                    disabled={group.files.length === 0 || workspace.staging}
                    onClick={() => workspace.setStaged(group.section === 'unstaged')}
                    className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    {group.icon}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{group.action}</TooltipContent>
              </Tooltip>
            }
            workspace={workspace}
          >
            <FileList
              files={group.files}
              fileList={workspace.fileList}
              selectedPath={selectedPathIn(workspace.selection, group.section)}
              onSelectFile={(path) => workspace.select({ list: group.section, path })}
            />
          </Section>
        ))}
      </div>
    </TooltipProvider>
  );
}

function CommitRow({
  commit,
  now,
  workspace,
}: {
  commit: GitDiffCommit;
  now: number;
  workspace: GitWorkspace;
}): React.JSX.Element {
  const open = workspace.openCommit === commit.hash;
  const files = workspace.commitFiles.get(commit.hash);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          'flex w-full items-start gap-1.5 rounded-control px-1.5 py-1.5 text-left transition-colors hover:bg-accent',
          selectedPathIn(workspace.selection, 'commit', commit.hash) !== null && 'bg-accent-subtle',
        )}
        title={`${commit.hash}\n${commit.subject}\n${commit.author}`}
        onClick={() => workspace.toggleCommit(commit.hash)}
      >
        <IconChevronRight
          size={12}
          className={cn(
            'mt-1 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body text-sidebar-foreground/80">{commit.subject}</span>
          <span className="flex gap-2 text-2xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono">{commit.shortHash}</span>
              {commit.author ? ` · ${commit.author}` : ''}
            </span>
            <span className="shrink-0">{formatTimeAgo(commit.date, now)}</span>
          </span>
        </span>
      </button>
      {open && (
        <ul className="pb-1">
          {files?.status === 'loading' && (
            <li className="flex items-center gap-2 py-1 pl-7 text-caption text-muted-foreground">
              <SpinningIcon>
                <IconLoader2 size={12} />
              </SpinningIcon>
              Loading files…
            </li>
          )}
          {files?.status === 'error' && (
            <li className="py-1 pl-7 text-caption text-danger-fg">{files.error}</li>
          )}
          {files?.status === 'ready' &&
            files.files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                depth={1}
                showDirectory
                selected={selectedPathIn(workspace.selection, 'commit', commit.hash) === file.path}
                onSelect={() =>
                  workspace.select({ list: 'commit', commit: commit.hash, path: file.path })
                }
              />
            ))}
        </ul>
      )}
    </li>
  );
}

function CommitsView({
  summary,
  workspace,
}: {
  summary: GitDiffSummary;
  workspace: GitWorkspace;
}): React.JSX.Element {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="pb-2">
      <Section
        section="branchCommits"
        label="On this branch"
        count={summary.commits.length}
        more={summary.moreCommits}
        emptyText={`No commits since ${summary.baseLabel}.`}
        workspace={workspace}
      >
        {summary.commits.map((commit) => (
          <CommitRow key={commit.hash} commit={commit} now={now} workspace={workspace} />
        ))}
      </Section>
      <Section
        section="baseCommits"
        label={`In ${summary.baseLabel}`}
        count={summary.baseCommits.length}
        emptyText="No earlier commits."
        workspace={workspace}
      >
        {summary.baseCommits.map((commit) => (
          <CommitRow key={commit.hash} commit={commit} now={now} workspace={workspace} />
        ))}
      </Section>
    </div>
  );
}

// App re-renders on every streamed agent batch; the workspace and the other
// props are stable, so the Git tab skips those renders.
const GitSidebar = memo(function GitSidebar({
  projectPath,
  projectName,
  workspace,
  shortcutBindings,
}: {
  projectPath: string;
  projectName: string;
  workspace: GitWorkspace;
  shortcutBindings: Map<string, ShortcutBinding> | null;
}): React.JSX.Element {
  const { summary, status, error, base, selection, mode } = workspace;
  const loading = status === 'loading';
  const view = workspace.view;
  const disabled = loading && !summary;

  return (
    <ShadcnSidebar collapsible="none" data-testid="git-sidebar" className="w-full">
      <SidebarHeader className="gap-0 border-b-[0.5px] border-foreground/15 pb-0 [-webkit-app-region:drag]">
        <div className="flex h-10 items-start justify-end">
          <SidebarToggle shortcutBinding={shortcutBindings?.get('sidebar.toggle')} />
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 px-2">
          <span className="min-w-0 truncate text-lg font-medium text-sidebar-foreground/80">
            {projectName}
          </span>
        </div>
        <span className="truncate px-2 pb-2 text-ui text-muted-foreground">
          {summary
            ? (summary.branch ?? (summary.detached ? 'Detached HEAD' : 'No branch'))
            : status === 'error'
              ? null
              : 'Loading…'}
        </span>

        <div className="-mx-2 flex flex-col gap-2 border-t-[0.5px] border-foreground/15 p-2 [-webkit-app-region:no-drag]">
          <div className="flex items-center gap-0.5 rounded-control bg-foreground/7 p-0.5">
            {VIEW_LABELS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={view === item.value}
                onClick={() => workspace.setView(item.value)}
                className={cn(
                  'h-6 flex-1 rounded-control-sm px-1 text-ui leading-none whitespace-nowrap transition-colors',
                  view === item.value
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {/* Git status and Commits each have a fixed comparison; only Diff offers modes. */}
          {view === 'diff' && (
            <GitDiffModeMenu
              mode={mode}
              defaultBase={summary?.defaultBase ?? null}
              baseLabel={summary?.baseLabel ?? null}
              disabled={disabled}
              onSelect={workspace.selectMode}
            />
          )}
          {mode === 'branch' && view !== 'commits' && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-caption whitespace-nowrap text-muted-foreground">
                Compare vs
              </span>
              <GitBasePicker
                projectPath={projectPath}
                summary={summary}
                base={base}
                disabled={disabled}
                onSelect={workspace.selectBase}
              />
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 gap-0 overflow-hidden">
        {view !== 'commits' && (
          <div className="flex justify-end px-2 pt-2">
            <SegmentedToggle
              options={FILE_LISTS}
              value={workspace.fileList}
              onChange={workspace.setFileList}
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto no-scrollbar px-1 pb-3">
          {status === 'error' && (
            <div className="mx-1 mb-2 rounded-control bg-destructive/10 px-2 py-2 text-caption text-destructive">
              <p>{error ?? 'Unable to read this diff.'}</p>
              <button
                type="button"
                className="mt-1 font-medium underline underline-offset-2"
                onClick={workspace.resetBase}
              >
                Reset comparison
              </button>
            </div>
          )}
          {!summary && status !== 'error' && (
            <div className="flex animate-in items-center gap-2 px-2 py-2 text-caption text-muted-foreground delay-300 fade-in-0 fill-mode-backwards">
              <SpinningIcon>
                <IconLoader2 size={13} />
              </SpinningIcon>
              Loading changes…
            </div>
          )}
          {summary &&
            view === 'diff' &&
            (summary.files.length === 0 ? (
              <p className="px-2 py-3 text-caption text-muted-foreground">
                No changes against {summary.baseLabel}.
              </p>
            ) : (
              <ul>
                <FileList
                  files={summary.files}
                  fileList={workspace.fileList}
                  selectedPath={selectedPathIn(selection, 'files')}
                  onSelectFile={(path) => workspace.select({ list: 'files', path })}
                />
              </ul>
            ))}
          {summary && view === 'status' && <StatusView summary={summary} workspace={workspace} />}
          {summary && view === 'commits' && <CommitsView summary={summary} workspace={workspace} />}
        </div>
      </SidebarContent>
    </ShadcnSidebar>
  );
});

export default GitSidebar;
