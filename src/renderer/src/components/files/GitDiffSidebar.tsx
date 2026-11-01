import { useMemo, useState } from 'react';
import {
  IconChevronRight,
  IconGitBranch,
  IconGitCommit,
  IconLoader2,
  IconRefresh,
} from '@tabler/icons-react';
import { FolderClosed, FolderOpen } from 'lucide-react';
import type { GitDiffFile, GitDiffSummary, ShortcutBinding } from '../../../../shared/ipcContract';
import type { GitDiffView, GitDiffWorkspace } from '../../hooks/useGitDiffWorkspace';
import { GIT_DIFF_STATUS_BADGES } from '../../lib/gitDiffLabels';
import { buildGitDiffTree, type GitDiffTreeDirectory } from '../../lib/gitDiffTree';
import { cn } from '../../lib/utils';
import { SidebarToggle } from '../sidebar/sidebarToggle';
import { FileIcon } from '../fileIcon';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '../ui/native-select';
import { SpinningIcon } from '../ui/spinningIcon';
import { Sidebar as ShadcnSidebar, SidebarContent, SidebarHeader } from '../ui/sidebar';

const INDENT_STEP_PX = 12;
const ROW_CLASS_NAME =
  'flex h-7 w-full items-center gap-1.5 rounded-control pr-2 text-left text-body transition-colors';
const ROW_IDLE_CLASS_NAME =
  'text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground';
const ROW_SELECTED_CLASS_NAME = 'bg-accent-subtle text-[var(--system-accent)]';

const VIEW_LABELS: { value: GitDiffView; label: string }[] = [
  { value: 'tree', label: 'Tree' },
  { value: 'status', label: 'Git status' },
  { value: 'commits', label: 'Commits' },
];

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function formatCommitDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function FileRow({
  file,
  depth,
  label,
  selected,
  onSelect,
}: {
  file: GitDiffFile;
  depth: number;
  label: string;
  selected: boolean;
  onSelect: (path: string) => void;
}): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        data-diff-path={file.path}
        style={{ paddingLeft: `${depth * INDENT_STEP_PX + 6}px` }}
        className={cn(ROW_CLASS_NAME, selected ? ROW_SELECTED_CLASS_NAME : ROW_IDLE_CLASS_NAME)}
        title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        onClick={() => onSelect(file.path)}
      >
        <span className="size-3 shrink-0" />
        <FileIcon path={file.path} className="size-4" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {GIT_DIFF_STATUS_BADGES[file.status]}
        </span>
        {file.status === 'untracked' ? (
          <span className="shrink-0 text-2xs text-success-fg">new</span>
        ) : file.binary ? (
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
              label={fileName(file.path)}
              selected={file.path === selectedPath}
              onSelect={onSelectFile}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeView({
  summary,
  selectedPath,
  onSelectFile,
}: {
  summary: GitDiffSummary;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}): React.JSX.Element {
  const tree = useMemo(() => buildGitDiffTree(summary.files), [summary.files]);
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

  if (summary.files.length === 0) {
    return (
      <p className="px-2 py-3 text-caption text-muted-foreground">
        No changes against {summary.baseLabel}.
      </p>
    );
  }

  return (
    <ul>
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
          label={fileName(file.path)}
          selected={file.path === selectedPath}
          onSelect={onSelectFile}
        />
      ))}
    </ul>
  );
}

function StatusView({
  summary,
  selectedPath,
  onSelectFile,
}: {
  summary: GitDiffSummary;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}): React.JSX.Element {
  const groups = [
    {
      label: 'Changes',
      files: summary.files.filter(
        (file) => file.status !== 'untracked' && file.workingTreeStatus !== null,
      ),
    },
    {
      label: 'Untracked',
      files: summary.files.filter((file) => file.status === 'untracked'),
    },
    {
      label: 'Committed',
      files: summary.files.filter(
        (file) => file.status !== 'untracked' && file.workingTreeStatus === null,
      ),
    },
  ].filter((group) => group.files.length > 0);

  if (groups.length === 0) {
    return (
      <p className="px-2 py-3 text-caption text-muted-foreground">
        No working-tree changes against {summary.baseLabel}.
      </p>
    );
  }

  return (
    <div className="pb-2">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="flex items-center justify-between px-2 pt-2 pb-1 text-caption text-muted-foreground">
            <span>{group.label}</span>
            <span>{group.files.length}</span>
          </div>
          <ul>
            {group.files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                depth={0}
                label={file.path}
                selected={file.path === selectedPath}
                onSelect={onSelectFile}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CommitsView({
  summary,
  onSelectBase,
  onChangeView,
}: {
  summary: GitDiffSummary;
  onSelectBase: (base: string) => void;
  onChangeView: (view: GitDiffView) => void;
}): React.JSX.Element {
  return (
    <div className="pb-2">
      <div className="px-2 pt-2 pb-1 text-caption text-muted-foreground">
        {summary.commits.length} commits since {summary.baseLabel}
      </div>
      {summary.commits.length === 0 ? (
        <p className="px-2 py-2 text-caption text-muted-foreground">
          No commits since {summary.baseLabel}.
        </p>
      ) : (
        <ul>
          {summary.commits.map((commit) => (
            <li key={commit.hash}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-accent"
                title={`${commit.hash}\n${commit.subject}\n${commit.author}`}
                onClick={() => {
                  onSelectBase(commit.hash);
                  onChangeView('tree');
                }}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-body text-sidebar-foreground/80">
                  <IconGitCommit size={13} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{commit.subject}</span>
                </span>
                <span className="pl-[19px] text-2xs text-muted-foreground">
                  {commit.shortHash}
                  {commit.date ? ` · ${formatCommitDate(commit.date)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GitDiffSidebar({
  projectName,
  workspace,
  shortcutBindings,
}: {
  projectName: string;
  workspace: GitDiffWorkspace;
  shortcutBindings: Map<string, ShortcutBinding> | null;
}): React.JSX.Element {
  const { summary, status, error, base, selectedPath, view } = workspace;
  const branches = summary?.branches ?? [];
  const localBranches = branches.filter((branch) => branch.local);
  const remoteBranches = branches.filter((branch) => !branch.local);
  const baseInBranches = branches.some((branch) => branch.name === base);
  const baseIsHead = base === 'HEAD';
  const loading = status === 'loading';

  return (
    <ShadcnSidebar collapsible="none" data-testid="git-diff-sidebar" className="w-full">
      <SidebarHeader className="pb-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex h-10 items-start justify-end">
          <SidebarToggle shortcutBinding={shortcutBindings?.get('sidebar.toggle')} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 px-2 pb-1">
          <span className="min-w-0 truncate text-lg font-medium text-sidebar-foreground/80">
            {projectName}
          </span>
        </div>
        <div className="px-2 pb-1">
          <span className="flex min-w-0 items-center gap-1 text-caption text-muted-foreground">
            <IconGitBranch size={12} className="shrink-0" />
            <span className="truncate">
              {summary?.branch ?? (summary?.detached ? 'Detached HEAD' : 'No branch')}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1 px-2 pb-2 [-webkit-app-region:no-drag]">
          <NativeSelect
            size="sm"
            aria-label="Compare against"
            className="min-w-0 flex-1"
            value={base ?? ''}
            disabled={loading || (!summary && branches.length === 0)}
            onChange={(event) => workspace.selectBase(event.target.value)}
          >
            {!base && <NativeSelectOption value="">Loading…</NativeSelectOption>}
            <NativeSelectOption value="HEAD">Working tree (HEAD)</NativeSelectOption>
            {!baseInBranches && base && !baseIsHead && (
              <NativeSelectOption value={base}>
                {summary?.baseLabel ?? base.slice(0, 8)}
              </NativeSelectOption>
            )}
            {localBranches.length > 0 && (
              <NativeSelectOptGroup label="Local branches">
                {localBranches.map((branch) => (
                  <NativeSelectOption key={branch.name} value={branch.name}>
                    {branch.name}
                    {branch.current ? ' (current)' : ''}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            )}
            {remoteBranches.length > 0 && (
              <NativeSelectOptGroup label="Remote branches">
                {remoteBranches.map((branch) => (
                  <NativeSelectOption key={branch.name} value={branch.name}>
                    {branch.name}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            )}
          </NativeSelect>
          <button
            type="button"
            aria-label="Refresh diff"
            title="Refresh diff"
            disabled={loading}
            onClick={workspace.refresh}
            className="flex size-7 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {loading ? (
              <SpinningIcon>
                <IconLoader2 size={14} />
              </SpinningIcon>
            ) : (
              <IconRefresh size={14} />
            )}
          </button>
        </div>

        {summary && (
          <div className="mx-2 mb-2 flex items-center gap-0.5 rounded-control bg-muted p-0.5">
            {VIEW_LABELS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={view === item.value}
                onClick={() => workspace.setView(item.value)}
                className={cn(
                  'h-6 flex-1 rounded-control-sm px-1 text-caption leading-none whitespace-nowrap transition-colors',
                  view === item.value
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="min-h-0 overflow-hidden">
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
            <div className="flex items-center gap-2 px-2 py-2 text-caption text-muted-foreground">
              <SpinningIcon>
                <IconLoader2 size={13} />
              </SpinningIcon>
              Loading changes…
            </div>
          )}
          {summary && view === 'tree' && (
            <TreeView
              summary={summary}
              selectedPath={selectedPath}
              onSelectFile={workspace.selectFile}
            />
          )}
          {summary && view === 'status' && (
            <StatusView
              summary={summary}
              selectedPath={selectedPath}
              onSelectFile={workspace.selectFile}
            />
          )}
          {summary && view === 'commits' && (
            <CommitsView
              summary={summary}
              onSelectBase={workspace.selectBase}
              onChangeView={workspace.setView}
            />
          )}
        </div>
      </SidebarContent>
    </ShadcnSidebar>
  );
}
