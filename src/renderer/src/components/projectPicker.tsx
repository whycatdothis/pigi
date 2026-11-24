import { useCallback, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { IconChevronDown, IconFolderOpen, IconListCheck } from '@tabler/icons-react';
import type { ProjectDirectory } from '../../../shared/ipcContract';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { baseName, cn } from '../lib/utils';

const PROJECT_SEARCH_PLACEHOLDER = 'Search projects';
const PROJECT_EMPTY_TEXT = 'No projects found';

/** What the picker's task section shows for a task session. */
export interface TaskPickerProjects {
  task: ProjectDirectory;
  workDirs: string[];
}

interface PickerEntry {
  path: string;
  name: string;
  section: 'workdir' | 'task' | 'project';
}

/**
 * The searchable project list. The composer uses it as a `#` chip; the Files
 * and Git sidebars use it as their title, to browse another project without
 * leaving the session. A task session prepends its working directories
 * (accent) and its own directory, divided from the ordinary projects.
 */
export function ProjectPicker({
  projectName,
  hashActive = false,
  recentProjects,
  taskProjects = null,
  selectedProjectPath,
  onSelectProject,
  forceOpen,
  onClose,
  variant = 'composer',
}: {
  projectName: string;
  hashActive?: boolean;
  recentProjects: ProjectDirectory[];
  taskProjects?: TaskPickerProjects | null;
  /** Marks the list's current entry; the sidebar also shows it as the trigger title. */
  selectedProjectPath?: string | null;
  onSelectProject: (path: string) => void;
  forceOpen?: boolean;
  onClose?: () => void;
  variant?: 'composer' | 'sidebarTitle';
}): React.JSX.Element {
  const [openInternal, setOpenInternal] = useState(false);
  const [search, setSearch] = useState('');

  const open = openInternal || (forceOpen ?? false);
  const isSidebarTitle = variant === 'sidebarTitle';

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpenInternal(nextOpen);
      if (!nextOpen) {
        setSearch('');
        onClose?.();
      }
    },
    [onClose],
  );

  const entries = useMemo<PickerEntry[]>(() => {
    const workDirs = (taskProjects?.workDirs ?? []).map((path) => ({
      path,
      name: baseName(path),
      section: 'workdir' as const,
    }));
    const task = taskProjects ? [{ ...taskProjects.task, section: 'task' as const }] : [];
    // A recent project that is also a task work dir shows once, in the task section.
    const taskPaths = new Set([
      ...(taskProjects?.workDirs ?? []),
      ...(taskProjects ? [taskProjects.task.path] : []),
    ]);
    const projects = recentProjects
      .filter((project) => !taskPaths.has(project.path))
      .map((project) => ({
        ...project,
        section: 'project' as const,
      }));
    return [...workDirs, ...task, ...projects];
  }, [taskProjects, recentProjects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const results = fuzzysort.go(search, entries, { key: 'name' });
    return results.map((r) => r.obj);
  }, [search, entries]);

  const renderEntry = (entry: PickerEntry): React.JSX.Element => (
    <CommandItem
      key={entry.path}
      value={entry.path}
      title={entry.path}
      data-checked={entry.path === selectedProjectPath}
      className="h-8"
      onSelect={() => {
        onSelectProject(entry.path);
        handleOpenChange(false);
      }}
    >
      {entry.section === 'task' ? (
        <IconListCheck className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <IconFolderOpen
          className={cn(
            'size-4 shrink-0',
            entry.section === 'workdir' ? 'text-[var(--system-accent)]' : 'text-muted-foreground',
          )}
        />
      )}
      <span
        className={cn('truncate', entry.section === 'workdir' && 'text-[var(--system-accent)]')}
      >
        {entry.name}
      </span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={isSidebarTitle ? (selectedProjectPath ?? projectName) : undefined}
          aria-label={isSidebarTitle ? `Switch project (${projectName})` : undefined}
          className={cn(
            isSidebarTitle
              ? 'group flex min-w-0 flex-1 items-center gap-1 rounded-control text-lg font-medium text-sidebar-foreground/80 transition-colors hover:text-sidebar-foreground [-webkit-app-region:no-drag]'
              : 'flex items-center rounded-chip px-1.5 py-0.5 text-body font-normal bg-muted/60 hover:bg-muted transition-colors text-muted-foreground',
          )}
        >
          {isSidebarTitle ? (
            <>
              <span className="min-w-0 truncate">{projectName}</span>
              <IconChevronDown className="size-4 shrink-0 opacity-50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </>
          ) : (
            <>
              <span className={cn('mr-0.5', hashActive && 'text-[var(--system-accent)]')}>#</span>
              <span className="truncate">{projectName}</span>
              <IconChevronDown className="size-4 shrink-0 ml-1 [&_path]:stroke-[1.8]" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className={cn(
          'w-auto gap-0 overflow-visible p-0 bg-popover/50',
          isSidebarTitle ? 'min-w-52' : 'min-w-40',
        )}
        // The composer takes focus back itself (onClose); the sidebar lets Radix
        // return it to the title.
        onCloseAutoFocus={onClose ? (event) => event.preventDefault() : undefined}
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder={PROJECT_SEARCH_PLACEHOLDER}
            inputGroupClassName="bg-transparent!"
          />
          <CommandList className="max-h-56">
            <CommandEmpty>{PROJECT_EMPTY_TEXT}</CommandEmpty>
            {search.trim() ? (
              <CommandGroup>{filtered.map(renderEntry)}</CommandGroup>
            ) : (
              <>
                {taskProjects && (
                  <>
                    <CommandGroup>
                      {filtered.filter((entry) => entry.section !== 'project').map(renderEntry)}
                    </CommandGroup>
                    <CommandSeparator className="mx-2 my-1 bg-foreground/10" />
                  </>
                )}
                <CommandGroup>
                  {filtered.filter((entry) => entry.section === 'project').map(renderEntry)}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
