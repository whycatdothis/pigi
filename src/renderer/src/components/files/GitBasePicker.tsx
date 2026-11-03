import { useState } from 'react';
import { IconGitCommit, IconSelector } from '@tabler/icons-react';
import type { GitDiffCommit, GitDiffSummary } from '../../../../shared/ipcContract';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { formatTimeAgo } from '../../lib/utils';

type PickerTab = 'branches' | 'commits';
const PICKER_TABS: { value: PickerTab; label: string }[] = [
  { value: 'branches', label: 'Branches' },
  { value: 'commits', label: 'Commits' },
];

function CommitItem({
  commit,
  checked,
  now,
  onSelect,
}: {
  commit: GitDiffCommit;
  checked: boolean;
  now: number;
  onSelect: (hash: string) => void;
}): React.JSX.Element {
  return (
    <CommandItem
      value={`${commit.shortHash} ${commit.subject} ${commit.hash}`}
      data-checked={checked ? true : undefined}
      onSelect={() => onSelect(commit.hash)}
    >
      <IconGitCommit className="text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
      <span className="shrink-0 text-2xs whitespace-nowrap text-muted-foreground">
        <span className="font-mono">{commit.shortHash}</span> · {formatTimeAgo(commit.date, now)}
      </span>
    </CommandItem>
  );
}

/**
 * What the Diff tab compares against: a branch, a recent commit, or any ref
 * typed into the search (a SHA, `HEAD~3`, a tag).
 */
export default function GitBasePicker({
  summary,
  base,
  disabled,
  onSelect,
}: {
  summary: GitDiffSummary | null;
  base: string | null;
  disabled: boolean;
  onSelect: (base: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PickerTab>('branches');
  const [openedAt, setOpenedAt] = useState(Date.now);
  const branches = summary?.branches ?? [];
  const commits = [...(summary?.commits ?? []), ...(summary?.baseCommits ?? [])];
  const typed = query.trim();

  const pick = (value: string): void => {
    onSelect(value);
    setOpen(false);
    setQuery('');
  };

  const branchGroup = (local: boolean): React.JSX.Element | null => {
    const group = branches.filter((branch) => branch.local === local);
    if (group.length === 0) return null;
    return (
      <CommandGroup heading={local ? 'Local branches' : 'Remote branches'}>
        {group.map((branch) => (
          <CommandItem
            key={branch.name}
            value={branch.name}
            data-checked={branch.name === base ? true : undefined}
            onSelect={() => pick(branch.name)}
          >
            <span className="min-w-0 truncate">{branch.name}</span>
            {branch.current && (
              <span className="shrink-0 text-2xs text-muted-foreground">current</span>
            )}
          </CommandItem>
        ))}
      </CommandGroup>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          return;
        }
        setOpenedAt(Date.now());
        // Reopen on the tab that holds the current base.
        setTab(commits.some((commit) => commit.hash === base) ? 'commits' : 'branches');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Compare against"
          disabled={disabled}
          className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-control border border-input px-2 text-left text-body transition-colors hover:bg-accent disabled:opacity-50"
        >
          <span className="min-w-0 flex-1 truncate">
            {summary?.baseLabel ?? base ?? 'Loading…'}
          </span>
          <IconSelector size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 min-w-(--radix-popover-trigger-width) gap-0 p-0"
      >
        <Command>
          <CommandInput
            autoFocus
            value={query}
            inputGroupClassName="h-7"
            onValueChange={setQuery}
          />
          <Tabs
            value={tab}
            onValueChange={(value) => {
              const next = PICKER_TABS.find((item) => item.value === value);
              if (next) setTab(next.value);
            }}
            className="border-b border-border px-1 py-1.5"
          >
            <TabsList className="w-full">
              {PICKER_TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="text-caption">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <CommandList className="max-h-64">
            <CommandEmpty>{tab === 'commits' ? 'No commits.' : 'No branches.'}</CommandEmpty>
            {tab === 'branches' && branchGroup(true)}
            {tab === 'branches' && branchGroup(false)}
            {tab === 'commits' && (
              <CommandGroup>
                {commits.map((commit) => (
                  <CommitItem
                    key={commit.hash}
                    commit={commit}
                    checked={commit.hash === base}
                    now={openedAt}
                    onSelect={pick}
                  />
                ))}
              </CommandGroup>
            )}
            {typed && (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`ref ${typed}`} onSelect={() => pick(typed)}>
                  <span className="min-w-0 truncate">
                    Compare against <span className="font-mono">{typed}</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
