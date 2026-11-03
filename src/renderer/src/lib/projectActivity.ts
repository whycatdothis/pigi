type Listener = (cwd: string) => void;

const listeners = new Set<Listener>();

/**
 * An agent finished a tool call or a run in `cwd`. Any tool counts, not just
 * edit/write: agents change files through bash (`sed`, scripts, git) too.
 */
export function notifyProjectActivity(cwd: string): void {
  for (const listener of listeners) listener(cwd);
}

export function onProjectActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
