import { useCallback, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { IconChevronDown, IconFolderOpen } from '@tabler/icons-react';
import type { ProjectDirectory } from '../../../../shared/ipcContract';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';

const PROJECT_SEARCH_PLACEHOLDER = 'Search projects';
const PROJECT_EMPTY_TEXT = 'No projects found';

export function ProjectPicker({
  projectName,
  hashActive,
  recentProjects,
  onSelectProject,
  forceOpen,
  onClose,
}: {
  projectName: string;
  hashActive: boolean;
  recentProjects: ProjectDirectory[];
  onSelectProject: (path: string) => void;
  forceOpen?: boolean;
  onClose?: () => void;
}): React.JSX.Element {
  const [openInternal, setOpenInternal] = useState(false);
  const [search, setSearch] = useState('');

  const open = openInternal || (forceOpen ?? false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpenInternal(nextOpen);
      if (!nextOpen) onClose?.();
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
          className={cn(
            'flex items-center rounded-md px-1.5 py-0.5 text-sm font-normal bg-muted/60 hover:bg-muted transition-colors text-muted-foreground',
          )}
        >
          <span className={cn('mr-0.5', hashActive && 'text-yellow-500')}>#</span>
          <span className="truncate">{projectName}</span>
          <IconChevronDown className="size-4 shrink-0 ml-1 [&_path]:stroke-[1.8]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-auto min-w-40 gap-0 overflow-visible p-0 bg-popover/50"
      >
        <Command>
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
                  value={project.name}
                  className="h-8"
                  onSelect={() => {
                    onSelectProject(project.path);
                    handleOpenChange(false);
                    setSearch('');
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
