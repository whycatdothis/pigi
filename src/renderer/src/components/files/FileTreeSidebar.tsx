import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  IconChevronRight,
  IconFolder,
  IconFolderOpen,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconSettings,
} from '@tabler/icons-react';
import type { ProjectDirectoryEntry, ShortcutBinding } from '../../../../shared/ipcContract';
import { cn } from '../../lib/utils';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { COMPACT_KBD_CLASS_NAME, MENU_ROW_KBD_CLASS_NAME, Kbd } from '../ui/kbd';
import { SpinningIcon } from '../ui/spinningIcon';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../ui/sidebar';
import { SidebarToggle } from '../sidebar/sidebarToggle';
import { FileIcon } from '../fileIcon';

const INDENT_STEP_PX = 12;
const ROW_CLASS_NAME =
  'flex h-7 w-full items-center gap-1.5 rounded-control pr-2 text-left text-body transition-colors';
const ROW_IDLE_CLASS_NAME =
  'text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground';
const ROW_SELECTED_CLASS_NAME = 'bg-accent-subtle text-[var(--system-accent)]';

interface DirectoryContent {
  entries: ProjectDirectoryEntry[];
  truncated: boolean;
}

interface FileTreeSidebarProps {
  projectPath: string;
  projectName: string;
  selectedFilePath: string | null;
  onOpenFile: (path: string) => void;
  onFindFile: () => void;
  onOpenSettings: () => void;
  shortcutBindings: Map<string, ShortcutBinding> | null;
}

/**
 * The left panel while the Files tab is active: the active project's tree,
 * loaded one directory at a time so a large `node_modules` is only read when
 * someone actually opens it.
 */
export default memo(function FileTreeSidebar({
  projectPath,
  projectName,
  selectedFilePath,
  onOpenFile,
  onFindFile,
  onOpenSettings,
  shortcutBindings,
}: FileTreeSidebarProps): React.JSX.Element {
  const [directories, setDirectories] = useState<Map<string, DirectoryContent>>(() => new Map());
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const loadedDirectoriesRef = useRef<Set<string>>(new Set());
  const pendingDirectoriesRef = useRef<Map<string, Promise<void>>>(new Map());
  const refreshGenerationRef = useRef(0);

  const loadDirectory = useCallback(
    (path: string): Promise<void> => {
      if (loadedDirectoriesRef.current.has(path)) {
        return Promise.resolve();
      }
      const pending = pendingDirectoriesRef.current.get(path);
      if (pending) {
        return pending;
      }

      const generation = refreshGenerationRef.current;
      setLoadingDirectories((previous) => new Set(previous).add(path));
      const request = window.piApi
        .listProjectDirectory(projectPath, path)
        .then((result) => {
          if (generation !== refreshGenerationRef.current) return;
          if (!result.success) {
            setError(result.error);
            return;
          }
          loadedDirectoriesRef.current.add(path);
          setError(null);
          setDirectories((previous) => {
            const next = new Map(previous);
            next.set(path, { entries: result.entries, truncated: result.truncated });
            return next;
          });
        })
        .catch(() => {
          if (generation === refreshGenerationRef.current) {
            setError('Unable to read this folder');
          }
        })
        .finally(() => {
          if (generation !== refreshGenerationRef.current) return;
          pendingDirectoriesRef.current.delete(path);
          setLoadingDirectories((previous) => {
            if (!previous.has(path)) return previous;
            const next = new Set(previous);
            next.delete(path);
            return next;
          });
        });
      pendingDirectoriesRef.current.set(path, request);
      return request;
    },
    [projectPath],
  );

  useEffect(() => {
    void loadDirectory('');
  }, [loadDirectory]);

  // A file opened from the search palette may sit under directories that have
  // never been loaded; open its path to it instead of leaving it invisible.
  useEffect(() => {
    const filePath = selectedFilePath;
    if (!filePath) return;
    let cancelled = false;

    async function revealFile(path: string): Promise<void> {
      const parts = path.split('/');
      const ancestors = [''];
      for (let index = 1; index < parts.length; index += 1) {
        ancestors.push(parts.slice(0, index).join('/'));
      }
      for (const directory of ancestors) {
        await loadDirectory(directory);
        if (cancelled) return;
        if (directory) {
          setExpandedDirectories((previous) => {
            if (previous.has(directory)) return previous;
            const next = new Set(previous);
            next.add(directory);
            return next;
          });
        }
      }
      if (!cancelled) {
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-file-path="${CSS.escape(path)}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        });
      }
    }

    void revealFile(filePath);
    return () => {
      cancelled = true;
    };
  }, [selectedFilePath, loadDirectory]);

  const toggleDirectory = useCallback(
    (path: string) => {
      if (!expandedDirectories.has(path)) {
        void loadDirectory(path);
      }
      setExpandedDirectories((previous) => {
        const next = new Set(previous);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    },
    [expandedDirectories, loadDirectory],
  );

  const refreshDirectories = useCallback(() => {
    refreshGenerationRef.current += 1;
    loadedDirectoriesRef.current.clear();
    pendingDirectoriesRef.current.clear();
    setDirectories(new Map());
    setLoadingDirectories(new Set());
    setError(null);
    void loadDirectory('');
    for (const path of expandedDirectories) {
      if (path) void loadDirectory(path);
    }
  }, [expandedDirectories, loadDirectory]);

  function renderDirectory(path: string, depth: number): React.JSX.Element[] | null {
    const content = directories.get(path);
    if (!content) return null;
    return content.entries.map((entry) => {
      const paddingLeft = `${depth * INDENT_STEP_PX + 6}px`;
      if (entry.isDirectory) {
        const isExpanded = expandedDirectories.has(entry.path);
        return (
          <li key={entry.path}>
            <button
              type="button"
              aria-expanded={isExpanded}
              style={{ paddingLeft }}
              className={cn(ROW_CLASS_NAME, ROW_IDLE_CLASS_NAME)}
              onClick={() => toggleDirectory(entry.path)}
            >
              <IconChevronRight
                size={12}
                className={cn(
                  'shrink-0 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-90',
                )}
              />
              {isExpanded ? (
                <IconFolderOpen size={16} className="shrink-0 text-muted-foreground" />
              ) : (
                <IconFolder size={16} className="shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{entry.name}</span>
              {loadingDirectories.has(entry.path) && (
                <SpinningIcon className="ml-auto">
                  <IconLoader2 size={12} className="text-muted-foreground" />
                </SpinningIcon>
              )}
            </button>
            {isExpanded && (
              <>
                <ul>{renderDirectory(entry.path, depth + 1)}</ul>
                {directories.get(entry.path)?.truncated && (
                  <div
                    className="py-1 pr-2 text-caption text-muted-foreground"
                    style={{ paddingLeft: `${(depth + 1) * INDENT_STEP_PX + 6}px` }}
                  >
                    More entries are not shown.
                  </div>
                )}
              </>
            )}
          </li>
        );
      }

      const isSelected = entry.path === selectedFilePath;
      return (
        <li key={entry.path}>
          <button
            type="button"
            data-file-path={entry.path}
            style={{ paddingLeft }}
            className={cn(
              ROW_CLASS_NAME,
              isSelected ? ROW_SELECTED_CLASS_NAME : ROW_IDLE_CLASS_NAME,
            )}
            onClick={() => onOpenFile(entry.path)}
          >
            <span className="size-3 shrink-0" />
            <FileIcon path={entry.path} className="size-4" />
            <span className="truncate">{entry.name}</span>
          </button>
        </li>
      );
    });
  }

  const rootContent = directories.get('');
  const findFileBinding = shortcutBindings?.get('files.search');
  const settingsBinding = shortcutBindings?.get('settings.open');

  return (
    <ShadcnSidebar collapsible="none" data-testid="file-tree-sidebar" className="w-full">
      <SidebarHeader style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex h-10 items-start justify-end">
          <SidebarToggle shortcutBinding={shortcutBindings?.get('sidebar.toggle')} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 px-2 pb-1">
          <IconFolder size={15} className="shrink-0 text-muted-foreground" />
          <span
            className="min-w-0 flex-1 truncate text-body font-medium text-sidebar-foreground/80"
            title={projectPath}
          >
            {projectName}
          </span>
          <button
            type="button"
            aria-label="Refresh files"
            title="Refresh files"
            onClick={refreshDirectories}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]"
          >
            <IconRefresh size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={onFindFile}
          className="mx-2 mb-1 flex h-7 items-center gap-2 rounded-control border border-foreground/10 bg-muted/40 px-2 text-body text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]"
        >
          <IconSearch size={14} className="shrink-0" />
          <span>Find file</span>
          {findFileBinding && (
            <Kbd className={cn(COMPACT_KBD_CLASS_NAME, 'ml-auto')}>
              {formatShortcutLabel(findFileBinding)}
            </Kbd>
          )}
        </button>
      </SidebarHeader>

      <SidebarContent className="min-h-0 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto no-scrollbar px-1 pb-3">
          {error && (
            <p className="mx-2 rounded-control bg-destructive/10 px-2 py-1.5 text-caption text-destructive">
              {error}
            </p>
          )}
          {!rootContent && !error && (
            <div className="flex items-center gap-2 px-2 py-2 text-caption text-muted-foreground">
              <SpinningIcon>
                <IconLoader2 size={13} />
              </SpinningIcon>
              Loading files…
            </div>
          )}
          {rootContent && (
            <ul>
              {renderDirectory('', 0)}
              {rootContent.truncated && (
                <li className="px-2 py-1 text-caption text-muted-foreground">
                  More entries are not shown.
                </li>
              )}
            </ul>
          )}
        </div>
      </SidebarContent>

      <SidebarFooter className="pt-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenSettings} className="group/menu-item">
              <IconSettings data-icon="inline-start" />
              <span>Settings</span>
              {settingsBinding && (
                <Kbd className={MENU_ROW_KBD_CLASS_NAME}>
                  {formatShortcutLabel(settingsBinding)}
                </Kbd>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </ShadcnSidebar>
  );
});
