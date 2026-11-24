import { useCallback, useRef, useState } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { TASK_NAME_PATTERN, type TaskResult } from '../../../../shared/ipcContract';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SpinningIcon } from '../ui/spinningIcon';

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  onCreateTask: (name: string) => Promise<TaskResult>;
}

export function NewTaskDialog({
  open,
  onOpenChange,
  existingNames,
  onCreateTask,
}: NewTaskDialogProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // State lags a rapid second Enter; the ref is the real in-flight guard.
  const creatingRef = useRef(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setName('');
        setError(null);
        setCreating(false);
        creatingRef.current = false;
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!TASK_NAME_PATTERN.test(trimmed)) {
      setError('Start with a letter or digit; letters, digits, dot, dash and underscore only.');
      return;
    }
    if (existingNames.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      setError(`A task named "${trimmed}" already exists.`);
      return;
    }
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    const result = await onCreateTask(trimmed);
    creatingRef.current = false;
    setCreating(false);
    if (result.success) {
      handleOpenChange(false);
    } else {
      setError(result.error);
    }
  }, [name, existingNames, onCreateTask, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <div>
          <Input
            type="text"
            autoFocus
            value={name}
            placeholder="task-name"
            spellCheck={false}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === 'Process') return;
              if (event.key === 'Enter') void handleSubmit();
            }}
          />
          {error && <div className="mt-1.5 text-caption text-destructive">{error}</div>}
        </div>
        <Button
          variant="outline"
          className="self-start"
          disabled={creating || !name.trim()}
          onClick={() => void handleSubmit()}
        >
          {creating ? (
            <SpinningIcon>
              <IconLoader2 className="size-4" />
            </SpinningIcon>
          ) : (
            'Create'
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
