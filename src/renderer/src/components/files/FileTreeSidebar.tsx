import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconChevronRight, IconLoader2, IconSettings } from '@tabler/icons-react';
import { FolderClosed, FolderOpen, Info } from 'lucide-react';
import type { ProjectDirectoryEntry, ShortcutBinding } from '../../../../shared/ipcContract';
import { cn } from '../../lib/utils';
import { formatShortcutLabel } from '../../shortcuts/formatShortcutLabel';
import { COMPACT_KBD_CLASS_NAME, MENU_ROW_KBD_CLASS_NAME, Kbd } from '../ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
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
  onOpenSettings: () => void;
  onActiveFileChanged: () => void;
  shortcutBindings: Map<string, ShortcutBinding> | null;
}

function parentDirectory(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
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
  onOpenSettings,
  onActiveFileChanged,
  shortcutBindings,
}: FileTreeSidebarProps): React.JSX.Element {
  const [directories, setDirectories] = useState<Map<string, DirectoryContent>>(() => new Map());
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const loadedDirectoriesRef = useRef<Set<string>>(new Set());
  const pendingDirectoriesRef = useRef<Map<string, Promise<void>>>(new Map());
  const requestIdRef = useRef(0);
  const requestIdByDirectoryRef = useRef<Map<string, number>>(new Map());

  const loadDirectory = useCallback(
    (path: string, force = false): Promise<void> => {
      if (!force && loadedDirectoriesRef.current.has(path)) {
        return Promise.resolve();
      }
      const pending = pendingDirectoriesRef.current.get(path);
      if (pending && !force) {
        return pending;
      }

      const requestId = ++requestIdRef.current;
      requestIdByDirectoryRef.current.set(path, requestId);
      setLoadingDirectories((previous) => new Set(previous).add(path));
      const request = window.piApi
        .listProjectDirectory(projectPath, path)
        .then((result) => {
          if (requestIdByDirectoryRef.current.get(path) !== requestId) return;
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

          // A directory can disappear while it is expanded or cached. Drop it
          // and its descendants so a recreated directory starts collapsed and
          // is read again instead of showing its previous contents.
          const removedDirectories = new Set<string>();
          for (const loaded of loadedDirectoriesRef.current) {
            if (loaded === path || parentDirectory(loaded) !== path) continue;
            if (result.entries.some((entry) => entry.path === loaded && entry.isDirectory)) {
              continue;
            }
            for (const candidate of loadedDirectoriesRef.current) {
              if (candidate === loaded || candidate.startsWith(`${loaded}/`)) {
                removedDirectories.add(candidate);
              }
            }
          }
          if (removedDirectories.size > 0) {
            for (const removed of removedDirectories) {
              loadedDirectoriesRef.current.delete(removed);
              requestIdByDirectoryRef.current.delete(removed);
              pendingDirectoriesRef.current.delete(removed);
            }
            setDirectories((previous) => {
              let next: Map<string, DirectoryContent> | null = null;
              for (const removed of removedDirectories) {
                if (!previous.has(removed)) continue;
                next ??= new Map(previous);
                next.delete(removed);
              }
              return next ?? previous;
            });
            setExpandedDirectories((previous) => {
              let next: Set<string> | null = null;
              for (const removed of removedDirectories) {
                if (!previous.has(removed)) continue;
                next ??= new Set(previous);
                next.delete(removed);
              }
              return next ?? previous;
            });
            setLoadingDirectories((previous) => {
              let next: Set<string> | null = null;
              for (const removed of removedDirectories) {
                if (!previous.has(removed)) continue;
                next ??= new Set(previous);
                next.delete(removed);
              }
              return next ?? previous;
            });
          }
        })
        .catch(() => {
          if (requestIdByDirectoryRef.current.get(path) === requestId) {
            setError('Unable to read this folder');
          }
        })
        .finally(() => {
          if (requestIdByDirectoryRef.current.get(path) !== requestId) return;
          requestIdByDirectoryRef.current.delete(path);
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
    return window.piApi.onProjectFilesChanged((change) => {
      if (change.cwd !== projectPath) return;
      for (const directory of change.directories) {
        void loadDirectory(directory, true);
      }
      if (change.filePath && change.filePath === selectedFilePath) {
        onActiveFileChanged();
      }
    });
  }, [loadDirectory, onActiveFileChanged, projectPath, selectedFilePath]);

  useEffect(() => {
    window.piApi.watchProjectFiles(projectPath, ['', ...expandedDirectories], selectedFilePath);
  }, [expandedDirectories, projectPath, selectedFilePath]);

  useEffect(() => {
    return () => {
      window.piApi.watchProjectFiles(projectPath, [], null);
    };
  }, [projectPath]);

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
        void loadDirectory(path, true);
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
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
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
      <SidebarHeader className="pb-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex h-10 items-start justify-end">
          <SidebarToggle shortcutBinding={shortcutBindings?.get('sidebar.toggle')} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 px-2 pb-1">
          <span
            className="min-w-0 truncate text-lg font-medium text-sidebar-foreground/80"
            title={projectPath}
          >
            {projectName}
          </span>
          {findFileBinding && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    aria-label="Find file shortcut"
                    className="ml-auto inline-flex shrink-0 items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden [-webkit-app-region:no-drag]"
                  >
                    <Info className="size-3.5" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <Kbd className={COMPACT_KBD_CLASS_NAME}>
                    {formatShortcutLabel(findFileBinding)}
                  </Kbd>
                  <span>to find file</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
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
