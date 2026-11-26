import type { TaskInfo } from '../../../shared/ipcContract';

const TASK_ORDER_STORAGE_KEY = 'pigi.taskOrder';

/** The sidebar's task order as the user dragged it into place; [] until the first drag. */
export function loadTaskOrder(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TASK_ORDER_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((path): path is string => typeof path === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveTaskOrder(paths: string[]): void {
  localStorage.setItem(TASK_ORDER_STORAGE_KEY, JSON.stringify(paths));
}

/**
 * Ranked tasks first in the stored order, then every task the order does not
 * know about (newly created, or the stored list is stale) in the order
 * listTasks delivered them. sort is stable, so the unranked tail keeps its
 * relative order instead of being scrambled.
 */
export function sortTasksByOrder(tasks: TaskInfo[], order: string[]): TaskInfo[] {
  const rank = new Map(order.map((path, index) => [path, index]));
  return [...tasks].sort(
    (a, b) => (rank.get(a.path) ?? order.length) - (rank.get(b.path) ?? order.length),
  );
}
