import { Fragment, useMemo, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { IconFolderOpen } from '@tabler/icons-react';
import { baseName, cn, tildePath } from '../../lib/utils';
import type { WorkdirPickerSections } from '../../lib/workdirPickerSections';
import { getHomeDir, pickDirectory } from '../../services/piAgentClient';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../ui/command';
import { InputGroupButton } from '../ui/input-group';
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';

interface DirEntry {
  path: string;
  name: string;
  section: 'task' | 'history' | 'project';
}

/**
 * The inline "Add directory" picker's list: the task's own directories on
 * top, every other directory (other tasks' and recent projects) merged below
 * without a divider. The filter input sits at the bottom like the git branch
 * picker's, with an Open button inside it for the system dialog. Picking a
 * row inserts a directory chip into the composer.
 */
export function WorkdirPicker({
  anchor,
  sections,
  onPick,
  onClose,
}: {
  /** The composer's inline button the popover is anchored to. */
  anchor: HTMLElement;
  sections: WorkdirPickerSections;
  onPick: (path: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const homeDir = getHomeDir();

  const groups = useMemo<DirEntry[][]>(() => {
    // A path lists once, in the first (most specific) section that claims it.
    const seen = new Set<string>();
    const dedupe = (entries: DirEntry[]): DirEntry[] =>
      entries.filter((entry) => {
        if (seen.has(entry.path)) return false;
        seen.add(entry.path);
        return true;
      });
    const own = dedupe(
      sections.taskDirs.map((dir) => ({
        path: dir,
        name: baseName(dir),
        section: 'task' as const,
      })),
    );
    const rest = dedupe([
      ...sections.historyDirs.map((dir) => ({
        path: dir,
        name: baseName(dir),
        section: 'history' as const,
      })),
      ...sections.projects.map((project) => ({
        path: project.path,
        name: project.name,
        section: 'project' as const,
      })),
    ]);
    return [own, rest].filter((group) => group.length > 0);
  }, [sections]);

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    return fuzzysort.go(search, groups.flat(), { key: 'name' }).map((result) => result.obj);
  }, [search, groups]);

  const renderEntry = (entry: DirEntry): React.JSX.Element => (
    <CommandItem
      key={entry.path}
      value={entry.path}
      title={tildePath(entry.path, homeDir)}
      className="h-8"
      onSelect={() => onPick(entry.path)}
    >
      <IconFolderOpen
        className={cn(
          'size-4 shrink-0',
          entry.section === 'task' ? 'text-[var(--system-accent)]' : 'text-muted-foreground',
        )}
      />
      <span className={cn('truncate', entry.section === 'task' && 'text-[var(--system-accent)]')}>
        {entry.name}
      </span>
    </CommandItem>
  );

  return (
    <Popover
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <PopoverAnchor virtualRef={{ current: anchor }} />
      <PopoverContent
        side="top"
        align="start"
        className="w-72 gap-0 p-0"
        // Focus goes back to the composer, not the widget's DOM button.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList className="max-h-64">
            <CommandEmpty>No directories found</CommandEmpty>
            {filtered ? (
              <CommandGroup>{filtered.map(renderEntry)}</CommandGroup>
            ) : (
              groups.map((group, index) => (
                <Fragment key={group[0].section}>
                  {index > 0 && <CommandSeparator className="mx-2 my-1 bg-foreground/10" />}
                  <CommandGroup>{group.map(renderEntry)}</CommandGroup>
                </Fragment>
              ))
            )}
          </CommandList>
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Filter directories"
            endAddon={
              <InputGroupButton
                variant="outline"
                className="px-1"
                onClick={() => {
                  void pickDirectory().then((result) => {
                    if (result.success && result.path !== null) onPick(result.path);
                  });
                }}
              >
                <IconFolderOpen />
                Open
              </InputGroupButton>
            }
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
