import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { IconFolderPlus, IconPlus, IconX } from '@tabler/icons-react';
import { FolderClosed } from 'lucide-react';
import type { TaskInfo, TaskResult, TaskUpdate } from '../../../../shared/ipcContract';
import { baseName, cn, tildePath } from '../../lib/utils';
import { getHomeDir, pickDirectory } from '../../services/piAgentClient';
import { useAppStore } from '../../state/appStore';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

// A footnote to the task name, not a list of controls: the bars keep the
// accent fill but a step smaller than the row's own type, so the directories
// read as an attribute of the row above instead of competing with the sessions
// below. px-1.5 is load-bearing: it is what puts the chip text on the task
// name's left edge.
const CHIP_CLASS_NAME =
  'flex h-4.5 shrink-0 items-center rounded-chip px-1.5 font-medium text-2xs transition-colors';
const MAX_VISIBLE_CANDIDATES = 8;

interface TaskWorkDirChipsProps {
  task: TaskInfo;
  onUpdateTask: (taskPath: string, update: TaskUpdate) => Promise<TaskResult>;
  onSelectWorkDir: (taskPath: string, dir: string | null) => void;
}

/**
 * The working-directory line inside an expanded task's row, hugging the task
 * name. Every chip is the same light accent fill — clicking anywhere on the
 * line opens the editor, none of them carries a pressed state. The editor is
 * a tag input the size of a textarea: chips with a hover X, Backspace deletes
 * from the end. Once you type, a dropdown fuzzy-searches every recent project
 * and every directory any task uses, with the native directory picker pinned
 * on top.
 */
export function TaskWorkDirChips({
  task,
  onUpdateTask,
  onSelectWorkDir,
}: TaskWorkDirChipsProps): React.JSX.Element {
  const [overflowing, setOverflowing] = useState(false);
  const [newDir, setNewDir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // null = no explicit arrow/hover yet: the first match then reads and acts
  // as selected (see activeIndex). Points past the last dir = the
  // "Open directory…" row.
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const recentProjects = useAppStore((state) => state.recentProjects);
  const tasks = useAppStore((state) => state.tasks);
  // Display-only: every absolute path the user sees is tilde-shortened.
  const homeDir = getHomeDir();
  const candidates = useMemo(() => {
    const dirs = new Set<string>();
    for (const project of recentProjects) dirs.add(project.path);
    for (const other of tasks) for (const dir of other.workDirs) dirs.add(dir);
    // Already a chip on this task.
    for (const dir of task.workDirs) dirs.delete(dir);
    return [...dirs];
  }, [recentProjects, tasks, task.workDirs]);

  const query = newDir.trim();
  const filtered = useMemo(() => {
    if (!query) return candidates.slice(0, MAX_VISIBLE_CANDIDATES);
    return fuzzysort
      .go(query, candidates, { limit: MAX_VISIBLE_CANDIDATES })
      .map((result) => result.target);
  }, [query, candidates]);
  const rowCount = filtered.length + 1;
  // Before any arrow/hover, the first match reads as selected — which Enter
  // already did implicitly. No matches: nothing is selected.
  const activeIndex = highlighted ?? (filtered.length > 0 ? 0 : null);
  // The dropdown exists only once there is a query to match against.
  const dropdownVisible = dropdownOpen && query !== '';

  useEffect(() => {
    const element = chipsRef.current;
    if (!element) return;
    const measure = (): void => setOverflowing(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // Content, not just count: a renamed dir can change the overflow.
  }, [task.workDirs]);

  useEffect(() => {
    if (highlighted === null) return;
    dropdownRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const addDir = useCallback(
    async (dir: string) => {
      const result = await onUpdateTask(task.path, { addWorkDirs: [dir] });
      if (result.success) {
        setNewDir('');
        setError(null);
        setHighlighted(null);
      } else {
        setError(result.error);
      }
    },
    [onUpdateTask, task.path],
  );

  const handlePickDirectory = useCallback(async () => {
    const result = await pickDirectory();
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (result.path !== null) await addDir(result.path);
  }, [addDir]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || event.key === 'Process') return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setDropdownOpen(true);
      setHighlighted((current) => {
        const base = current ?? activeIndex ?? (event.key === 'ArrowDown' ? -1 : rowCount);
        return (base + (event.key === 'ArrowDown' ? 1 : rowCount - 1)) % rowCount;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (dropdownVisible && highlighted !== null) {
        if (highlighted < filtered.length) void addDir(filtered[highlighted]);
        else void handlePickDirectory();
      } else if (dropdownVisible && filtered.length > 0) {
        void addDir(filtered[0]);
      } else if (query) {
        // No match (or dropdown closed): the typed text is the directory.
        void addDir(query);
      }
      return;
    }
    if (event.key === 'Backspace' && newDir === '' && task.workDirs.length > 0) {
      event.preventDefault();
      void onUpdateTask(task.path, {
        removeWorkDirs: [task.workDirs[task.workDirs.length - 1]],
      });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* A div, not a button: the editor's chips make nested controls
            unavoidable, so the row carries the button role by hand. */}
        <div
          role="button"
          tabIndex={0}
          title="Edit working directories"
          // The row lives inside the task name's row: opening the editor must
          // not read as toggling the task.
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          }}
          // pl-4 inside the row button's p-2, plus the chips' own px-1.5, puts
          // their text under the name text (8 + 16 + 6 + 6 = 30px from the
          // row's left edge, where the name's text starts).
          className="mt-0.5 flex h-5 cursor-pointer items-center gap-1 pl-4"
        >
          {task.workDirs.length === 0 ? (
            <span
              className={cn(
                CHIP_CLASS_NAME,
                'gap-0.5 border border-dashed border-muted-foreground/40 text-muted-foreground',
              )}
            >
              <IconFolderPlus className="size-3.5" />
              <span>Working directories</span>
            </span>
          ) : (
            <>
              <div ref={chipsRef} className="flex min-w-0 items-center gap-1 overflow-hidden">
                {task.workDirs.map((dir) => (
                  <span
                    key={dir}
                    title={tildePath(dir, homeDir)}
                    className={cn(
                      CHIP_CLASS_NAME,
                      'bg-accent-subtle/70 text-[var(--system-accent)]',
                      task.activeWorkDir === dir && 'bg-accent-subtle',
                    )}
                  >
                    <span className="truncate">{baseName(dir)}</span>
                  </span>
                ))}
              </div>
              <span className={cn(CHIP_CLASS_NAME, 'bg-muted/60 text-muted-foreground')}>
                {overflowing ? '…' : <IconPlus className="size-3.5" />}
              </span>
            </>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        // Bottom, not top: anchored at its top edge, so the dropdown growing
        // or shrinking below the input never moves the input itself.
        side="bottom"
        align="start"
        sideOffset={4}
        // ! because .menu-content lives in @layer utilities and its own
        // padding would otherwise win the source-order tie against p-3.
        className="menu-content follows-text-size flex w-80 flex-col gap-2.5 p-3!"
        // Portal events bubble through the React tree, not the DOM tree:
        // without this stop, any click in the editor reaches the task row's
        // toggle handler and collapses the task.
        onClick={(event) => event.stopPropagation()}
        onEscapeKeyDown={(event) => {
          // Radix listens for Esc on document capture, ahead of any input
          // handler, so the first Esc lands here: spend it on the dropdown
          // and keep the editor open.
          if (dropdownOpen) {
            event.preventDefault();
            setDropdownOpen(false);
            setHighlighted(null);
          }
        }}
      >
        {/* Title and hint form one block; the popover's own gap separates
            the block from the input box below it. */}
        <div className="pt-0.5">
          <div className="text-caption font-medium text-muted-foreground">Working directories</div>
          {/* -mt-1 spends part of the generous line-height of both lines:
              the glyph gap drops from ~8px to ~4px, close but not touching. */}
          <div className="-mt-1 text-2xs text-muted-foreground/80">
            Collected automatically as sessions run — edit if wrong.
          </div>
        </div>
        <div className="flex max-h-24 min-h-16 flex-wrap content-start items-start gap-1 overflow-y-auto rounded-control border border-input px-2 py-1.5">
          {task.workDirs.map((dir) => (
            <span
              key={dir}
              className={cn(
                // Same text style as the chips in the task row, and the same
                // active cue too: weight is uniform, the active directory
                // carries the stronger fill.
                'group/chip flex h-5 max-w-full items-center gap-0.5 rounded-chip bg-accent-subtle/70 pl-1.5 pr-0.5 font-medium text-2xs text-[var(--system-accent)]',
                task.activeWorkDir === dir && 'bg-accent-subtle',
              )}
            >
              <button
                type="button"
                title={`${tildePath(dir, homeDir)} — click to make it the active directory`}
                onClick={() => onSelectWorkDir(task.path, dir)}
                className="min-w-0 truncate"
              >
                {baseName(dir)}
              </button>
              <button
                type="button"
                title={`Remove ${baseName(dir)}`}
                onClick={() => void onUpdateTask(task.path, { removeWorkDirs: [dir] })}
                className="shrink-0 rounded-inline opacity-0 transition-opacity group-hover/chip:opacity-100 hover:text-foreground focus-visible:opacity-100"
              >
                <IconX className="size-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newDir}
            aria-label="Add working directory"
            aria-expanded={dropdownVisible}
            placeholder={task.workDirs.length === 0 ? 'Type to filter known directories' : ''}
            spellCheck={false}
            autoFocus
            onChange={(event) => {
              setNewDir(event.target.value);
              setError(null);
              setHighlighted(null);
              setDropdownOpen(true);
            }}
            onBlur={() => {
              setDropdownOpen(false);
              setHighlighted(null);
            }}
            onKeyDown={handleInputKeyDown}
            className="h-5 min-w-20 flex-1 bg-transparent font-mono text-caption outline-none placeholder:text-muted-foreground"
          />
        </div>
        {error && <div className="px-0.5 text-caption text-destructive">{error}</div>}
        {dropdownVisible && (
          <div
            role="listbox"
            aria-label="Known directories"
            className="overflow-hidden rounded-control border border-input"
          >
            {/* Pinned above the scrollable matches: always visible no matter
                how long the list is, yet never the default — Enter with no
                highlight still takes the first match. In the arrow-key cycle
                it stays last, so ArrowUp from the first match lands on it. */}
            <button
              type="button"
              role="option"
              aria-selected={activeIndex === filtered.length}
              data-highlighted={activeIndex === filtered.length}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlighted(filtered.length)}
              onClick={() => void handlePickDirectory()}
              className={cn(
                'flex w-full items-center gap-1.5 px-2 py-1.5 text-left',
                activeIndex === filtered.length && 'bg-muted',
              )}
            >
              <IconFolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-body">Open directory…</span>
            </button>
            <div ref={dropdownRef} className="max-h-44 overflow-y-auto border-t p-0.5">
              {filtered.length === 0 && (
                <div className="px-2 py-1.5 text-caption text-muted-foreground">
                  No matches — Enter adds the typed path
                </div>
              )}
              {filtered.map((dir, index) => {
                const display = tildePath(dir, homeDir);
                const name = baseName(dir);
                // Middle ellipsis: the parent yields all its width first (the
                // huge shrink factor), then the name's head truncates; the
                // name's tail never shrinks, so the end of the path — the part
                // that matters — is always on screen.
                const parent = display.slice(0, display.length - name.length);
                const nameMid = Math.ceil(name.length / 2);
                return (
                  <button
                    key={dir}
                    type="button"
                    role="option"
                    title={display}
                    aria-selected={activeIndex === index}
                    data-highlighted={activeIndex === index}
                    // Keep the input focused; the click handler still fires.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => void addDir(dir)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-inline px-2 py-1.5 text-left',
                      activeIndex === index && 'bg-muted',
                    )}
                  >
                    <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 text-body">
                      <span className="min-w-0 shrink-[1000] truncate">{parent}</span>
                      <span className="min-w-0 truncate">{name.slice(0, nameMid)}</span>
                      <span className="shrink-0">{name.slice(nameMid)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
