import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconFolderPlus, IconPlus, IconX } from '@tabler/icons-react';
import type { TaskInfo, TaskResult, TaskUpdate } from '../../../../shared/ipcContract';
import { baseName, cn } from '../../lib/utils';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const CHIP_CLASS_NAME =
  'flex h-5 shrink-0 items-center rounded-chip px-1.5 text-caption transition-colors';

interface TaskWorkDirChipsProps {
  task: TaskInfo;
  onUpdateTask: (taskPath: string, update: TaskUpdate) => Promise<TaskResult>;
  onSelectWorkDir: (taskPath: string, dir: string | null) => void;
}

/**
 * The working-directory row under an expanded task: accent chips, an ellipsis
 * when they overflow, and a popover that edits the list. Suggestions the dir
 * watcher collected live at the popover's bottom; dismissing one tombstones
 * it so the watcher does not offer it again.
 */
export function TaskWorkDirChips({
  task,
  onUpdateTask,
  onSelectWorkDir,
}: TaskWorkDirChipsProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [newDir, setNewDir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

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

  const handleAdd = useCallback(async () => {
    const dir = newDir.trim();
    if (!dir) return;
    const result = await onUpdateTask(task.path, { addWorkDirs: [dir] });
    if (result.success) {
      setNewDir('');
      setError(null);
    } else {
      setError(result.error);
    }
  }, [newDir, onUpdateTask, task.path]);

  return (
    <div className="relative flex h-6 items-center pr-1 pl-6">
      <div ref={chipsRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {task.workDirs.map((dir) => (
          <button
            key={dir}
            type="button"
            title={dir}
            onClick={() => onSelectWorkDir(task.path, dir)}
            className={cn(
              CHIP_CLASS_NAME,
              task.activeWorkDir === dir
                ? 'bg-accent-subtle font-medium text-[var(--system-accent)]'
                : 'bg-muted/60 text-[var(--system-accent)] hover:bg-muted',
            )}
          >
            <span className="truncate">{baseName(dir)}</span>
          </button>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {task.workDirs.length === 0 ? (
            <button
              type="button"
              className={cn(
                CHIP_CLASS_NAME,
                'gap-0.5 border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground',
              )}
            >
              <IconFolderPlus className="size-3.5" />
              <span>Working directories</span>
            </button>
          ) : (
            <button
              type="button"
              title="Edit working directories"
              className={cn(
                CHIP_CLASS_NAME,
                'ml-1 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {overflowing ? '…' : <IconPlus className="size-3.5" />}
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={4}
          className="menu-content follows-text-size flex w-72 flex-col gap-1 p-1.5"
        >
          {task.workDirs.length > 0 && (
            <div className="flex flex-col">
              {task.workDirs.map((dir) => (
                <div
                  key={dir}
                  className="group/dir flex h-7 items-center rounded-control hover:bg-muted/50"
                >
                  <button
                    type="button"
                    title={`Open ${dir} in Files`}
                    onClick={() => onSelectWorkDir(task.path, dir)}
                    className={cn(
                      'min-w-0 flex-1 truncate px-1.5 text-left text-body',
                      task.activeWorkDir === dir && 'text-[var(--system-accent)]',
                    )}
                  >
                    {dir}
                  </button>
                  <button
                    type="button"
                    title={`Remove ${baseName(dir)}`}
                    onClick={() => void onUpdateTask(task.path, { removeWorkDirs: [dir] })}
                    className="shrink-0 px-1.5 text-muted-foreground opacity-0 transition-opacity group-hover/dir:opacity-100 hover:text-foreground"
                  >
                    <IconX className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 px-0.5">
            <Input
              type="text"
              value={newDir}
              placeholder="/absolute/path/to/directory"
              spellCheck={false}
              onChange={(event) => {
                setNewDir(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.key === 'Process') return;
                if (event.key === 'Enter') void handleAdd();
              }}
              className="h-7 font-mono text-caption"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!newDir.trim()}
              className="flex h-7 shrink-0 items-center rounded-control bg-muted/60 px-2 text-body hover:bg-muted disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {error && <div className="px-1.5 pb-0.5 text-caption text-destructive">{error}</div>}
          {task.suggestedDirs.length > 0 && (
            <>
              <div className="mt-1 border-t px-1.5 pt-1.5 text-caption text-muted-foreground">
                Seen in sessions
              </div>
              <div className="flex flex-col">
                {task.suggestedDirs.map((dir) => (
                  <div
                    key={dir}
                    className="group/dir flex h-7 items-center gap-1 rounded-control px-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-body" title={dir}>
                      {dir}
                    </span>
                    <button
                      type="button"
                      title={`Add ${baseName(dir)}`}
                      onClick={() => void onUpdateTask(task.path, { addWorkDirs: [dir] })}
                      className="shrink-0 text-muted-foreground hover:text-[var(--system-accent)]"
                    >
                      <IconCheck className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title={`Dismiss ${baseName(dir)}`}
                      onClick={() => void onUpdateTask(task.path, { ignoreSuggestedDirs: [dir] })}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
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
    </div>
  );
}
