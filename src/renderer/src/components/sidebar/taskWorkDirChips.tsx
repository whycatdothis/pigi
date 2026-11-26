import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { IconFolderPlus, IconPlus, IconX } from '@tabler/icons-react';
import { FolderClosed } from 'lucide-react';
import type { TaskInfo, TaskResult, TaskUpdate } from '../../../../shared/ipcContract';
import { baseName, cn } from '../../lib/utils';
import { pickDirectory } from '../../services/piAgentClient';
import { useAppStore } from '../../state/appStore';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const CHIP_CLASS_NAME =
  'flex h-5 shrink-0 items-center rounded-chip px-1.5 text-caption transition-colors';
const MAX_VISIBLE_CANDIDATES = 8;

interface TaskWorkDirChipsProps {
  task: TaskInfo;
  onUpdateTask: (taskPath: string, update: TaskUpdate) => Promise<TaskResult>;
  onSelectWorkDir: (taskPath: string, dir: string | null) => void;
}

/**
 * The working-directory row under an expanded task. Every chip is the same
 * light accent fill — clicking anywhere on the row opens the editor, none of
 * them carries a pressed state. The editor is a tag input the size of a
 * textarea: chips with a hover X, Backspace deletes from the end. Once you
 * type, a dropdown fuzzy-searches every recent project and every directory
 * any task uses, always ending with a native directory picker. Suggestions
 * watcher collected sit below; clicking one adds it, its X tombstones it.
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
  // null = no explicit arrow/hover yet; Enter then takes the first match, or
  // the typed text when nothing matches. Points past the last dir = the
  // "Open directory…" row.
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const recentProjects = useAppStore((state) => state.recentProjects);
  const tasks = useAppStore((state) => state.tasks);
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
        const base = current ?? (event.key === 'ArrowDown' ? -1 : rowCount);
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
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          }}
          // pl-1.5, not the rows' usual pl-2: the chips' own px-1.5 then puts
          // their text on the task icon's glyph (x≈20) instead of 2px right
          // of it; the chip fill's 2px overhang is invisible (no row hover bg).
          className="relative flex h-6 cursor-pointer items-center gap-1 pr-1 pl-1.5"
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
                    title={dir}
                    className={cn(
                      CHIP_CLASS_NAME,
                      'bg-accent-subtle/70 text-[var(--system-accent)]',
                      task.activeWorkDir === dir && 'bg-accent-subtle font-medium',
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
        side="top"
        align="start"
        sideOffset={4}
        className="menu-content follows-text-size flex w-80 flex-col gap-1.5 p-2"
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
        <div className="px-0.5 text-caption font-medium text-muted-foreground">
          Working directories
        </div>
        <div className="flex min-h-16 flex-wrap content-start items-start gap-1 rounded-control border border-input px-2 py-1.5">
          {task.workDirs.map((dir) => (
            <span
              key={dir}
              className="group/chip flex h-5 max-w-full items-center gap-0.5 rounded-chip bg-accent-subtle pl-1.5 pr-0.5 text-caption text-[var(--system-accent)]"
            >
              <button
                type="button"
                title={`${dir} — click to make it the active directory`}
                onClick={() => onSelectWorkDir(task.path, dir)}
                className={cn('min-w-0 truncate', task.activeWorkDir === dir && 'font-medium')}
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
            ref={dropdownRef}
            role="listbox"
            aria-label="Known directories"
            className="max-h-44 overflow-y-auto rounded-control border border-input p-0.5"
          >
            {query && filtered.length === 0 && (
              <div className="px-2 py-1.5 text-caption text-muted-foreground">
                No matches — Enter adds the typed path
              </div>
            )}
            {filtered.map((dir, index) => {
              const name = baseName(dir);
              // The parent truncates, the folder name never does: the ellipsis
              // lands mid-path where the least information is lost.
              const parent = dir.slice(0, dir.length - name.length);
              return (
                <button
                  key={dir}
                  type="button"
                  role="option"
                  title={dir}
                  aria-selected={highlighted === index}
                  data-highlighted={highlighted === index}
                  // Keep the input focused; the click handler still fires.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => void addDir(dir)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-inline px-2 py-1.5 text-left',
                    highlighted === index && 'bg-muted',
                  )}
                >
                  <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 text-body">
                    <span className="min-w-0 truncate">{parent}</span>
                    <span className="shrink-0">{name}</span>
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              role="option"
              aria-selected={highlighted === filtered.length}
              data-highlighted={highlighted === filtered.length}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlighted(filtered.length)}
              onClick={() => void handlePickDirectory()}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-inline px-2 py-1.5 text-left',
                filtered.length > 0 && 'mt-0.5 border-t',
                highlighted === filtered.length && 'bg-muted',
              )}
            >
              <IconFolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-body">Open directory…</span>
            </button>
          </div>
        )}
        {task.suggestedDirs.length > 0 && (
          <>
            <div className="px-0.5 pt-0.5 text-caption text-muted-foreground">
              Seen in sessions — click to add
            </div>
            <div className="flex flex-col">
              {task.suggestedDirs.map((dir) => (
                <div
                  key={dir}
                  className="group/suggestion flex h-7 items-center rounded-control hover:bg-muted/50"
                >
                  <button
                    type="button"
                    title={`Add ${dir}`}
                    onClick={() => void onUpdateTask(task.path, { addWorkDirs: [dir] })}
                    className="min-w-0 flex-1 truncate px-1.5 text-left text-body"
                  >
                    {dir}
                  </button>
                  <button
                    type="button"
                    title={`Dismiss ${baseName(dir)}`}
                    onClick={() => void onUpdateTask(task.path, { ignoreSuggestedDirs: [dir] })}
                    className="shrink-0 px-1.5 text-muted-foreground opacity-0 transition-opacity group-hover/suggestion:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <IconX className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
