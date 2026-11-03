import { IconChevronDown } from '@tabler/icons-react';
import type { GitDiffMode } from '../../hooks/useGitWorkspace';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const MODES: readonly GitDiffMode[] = ['branch', 'uncommitted', 'lastCommit'];

function modeLabel(mode: GitDiffMode, base: string | null): string {
  switch (mode) {
    case 'branch':
      return base ? `All changes since ${base}` : 'All changes';
    case 'uncommitted':
      return 'Uncommitted changes';
    case 'lastCommit':
      return 'Last commit';
  }
}

/**
 * What the Git tab shows. The button names the base in use, which the picker
 * can change; the menu offers the default branch, which choosing it restores.
 */
export default function GitDiffModeMenu({
  mode,
  defaultBase,
  baseLabel,
  disabled,
  onSelect,
}: {
  mode: GitDiffMode;
  defaultBase: string | null;
  baseLabel: string | null;
  disabled: boolean;
  onSelect: (mode: GitDiffMode) => void;
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Diff mode"
          disabled={disabled}
          className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-control border border-input px-2 text-left text-body transition-colors hover:bg-accent disabled:opacity-50"
        >
          <span className="min-w-0 flex-1 truncate">{modeLabel(mode, baseLabel)}</span>
          <IconChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-max min-w-(--radix-dropdown-menu-trigger-width)"
      >
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            const next = MODES.find((item) => item === value);
            if (next) onSelect(next);
          }}
        >
          {MODES.map((item) => (
            <DropdownMenuRadioItem key={item} value={item} className="whitespace-nowrap">
              {modeLabel(item, defaultBase)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
