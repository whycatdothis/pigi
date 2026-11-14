import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { IconChevronDown, IconGitBranch } from '@tabler/icons-react';
import type { GitDiffBranch } from '../../../../shared/ipcContract';
import { listGitBranches, switchGitBranch } from '../../services/piAgentClient';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const BRANCH_SEARCH_PLACEHOLDER = 'Search branches';

const TRIGGER_CLASS_NAME = {
  composer:
    '-mx-1 flex min-w-0 max-w-full items-center gap-1.5 rounded-chip px-1 py-0.5 text-body text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
  sidebar:
    // The Git tab's header is a window drag region; without this a real click drags.
    '-mx-1 flex min-w-0 max-w-full items-center gap-1 rounded-control px-1 text-ui text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [-webkit-app-region:no-drag]',
} as const;

interface BranchList {
  projectPath: string;
  branches: GitDiffBranch[];
}

/**
 * The branch the project is on, as a picker: choosing another one switches the
 * working tree. Only local branches are listed — `git switch` would create a
 * local branch from a bare remote name rather than switch to the remote one —
 * and a branch's own row just closes the list.
 */
export default function GitBranchPicker({
  projectPath,
  label,
  variant = 'composer',
  onSwitched,
}: {
  projectPath: string;
  /** The trigger's text: the branch, `Detached HEAD`, or a placeholder. */
  label: string;
  variant?: 'composer' | 'sidebar';
  /** Called after another branch is checked out, to reread what showed the old one. */
  onSwitched: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Carries its project: the composer switches project without remounting this
  // picker, and another repository's branches must never be listed or switched.
  const [list, setList] = useState<BranchList | null>(null);
  const [switching, setSwitching] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const branches = list?.projectPath === projectPath ? list.branches : null;

  // Read on each open, and again if the project changes while it is open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listGitBranches(projectPath, false)
      .then((result) => {
        if (cancelled) return;
        setList({ projectPath, branches: result.success ? result.branches : [] });
        if (!result.success) toast.error(result.error);
      })
      .catch(() => {
        if (!cancelled) setList({ projectPath, branches: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectPath]);

  // cmdk scrolls its selection into view before the filtered rows settle,
  // which leaves the best match above the fold; start each result at the top.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [open, query]);

  const pick = (branch: string): void => {
    if (switching) return;
    setOpen(false);
    setQuery('');
    if (branches?.some((entry) => entry.name === branch && entry.current)) return;
    setSwitching(true);
    switchGitBranch(projectPath, branch)
      .then((result) => {
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        onSwitched();
      })
      .catch(() => toast.error('Unable to switch branches.'))
      .finally(() => setSwitching(false));
  };

  const searchInput = (
    <CommandInput
      autoFocus
      value={query}
      inputGroupClassName="h-7"
      placeholder={BRANCH_SEARCH_PLACEHOLDER}
      onValueChange={setQuery}
    />
  );
  // The search sits on the edge the popover is pinned to, so filtering cannot
  // slide it: the composer opens upward off the composer, the sidebar downward.
  const searchFirst = variant === 'sidebar';

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Switch branch (${label})`}
          disabled={projectPath.length === 0}
          className={TRIGGER_CLASS_NAME[variant]}
        >
          {variant === 'composer' && <IconGitBranch className="size-4 shrink-0" />}
          <span className="min-w-0 truncate">{label}</span>
          <IconChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={searchFirst ? 'bottom' : 'top'}
        align="start"
        className="w-72 min-w-(--radix-popover-trigger-width) gap-0 p-0"
      >
        <Command>
          {searchFirst && searchInput}
          <CommandList ref={listRef} className="max-h-64">
            <CommandEmpty>{branches === null ? 'Loading branches…' : 'No branches.'}</CommandEmpty>
            <CommandGroup>
              {(branches ?? []).map((branch) => (
                <CommandItem
                  key={branch.name}
                  value={branch.name}
                  data-checked={branch.current ? true : undefined}
                  disabled={switching}
                  onSelect={() => pick(branch.name)}
                >
                  <span className="min-w-0 truncate">{branch.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {!searchFirst && searchInput}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
