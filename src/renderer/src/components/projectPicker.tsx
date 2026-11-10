import { useCallback, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { IconChevronDown, IconFolderOpen } from '@tabler/icons-react';
import type { ProjectDirectory } from '../../../shared/ipcContract';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';

const PROJECT_SEARCH_PLACEHOLDER = 'Search projects';
const PROJECT_EMPTY_TEXT = 'No projects found';

/**
 * The searchable project list. The composer uses it as a `#` chip; the Files
 * and Git sidebars use it as their title, to browse another project without
 * leaving the session.
 */
export function ProjectPicker({
  projectName,
  hashActive = false,
  recentProjects,
  selectedProjectPath,
  onSelectProject,
  forceOpen,
  onClose,
  variant = 'composer',
}: {
  projectName: string;
  hashActive?: boolean;
  recentProjects: ProjectDirectory[];
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

  const filtered = useMemo(() => {
    if (!search.trim()) return recentProjects;
    const results = fuzzysort.go(search, recentProjects, { key: 'name' });
    return results.map((r) => r.obj);
  }, [search, recentProjects]);

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
            <CommandGroup>
              {filtered.map((project) => (
                <CommandItem
                  key={project.path}
                  value={project.path}
                  title={project.path}
                  data-checked={project.path === selectedProjectPath}
                  className="h-8"
                  onSelect={() => {
                    onSelectProject(project.path);
                    handleOpenChange(false);
                  }}
                >
                  <IconFolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
