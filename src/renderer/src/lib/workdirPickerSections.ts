import type { ProjectDirectory, TaskInfo } from '../../../shared/ipcContract';

/** What the composer working-dir picker lists. */
export interface WorkdirPickerSections {
  /** The task's own directories, at the top of the list. */
  taskDirs: string[];
  /** Directories other tasks use, merged with the projects below them. */
  historyDirs: string[];
  /** Recent projects. */
  projects: ProjectDirectory[];
}

/**
 * The composer's "Add directory" sections for the task at `cwd`, or null when
 * it isn't a task. The task's own dirs top the list, other tasks' dirs and
 * recent projects follow; a dir lists once, and a dir the user removed or
 * dismissed from this task stays out until they add it back.
 */
export function buildWorkdirPickerSections(
  tasks: TaskInfo[],
  cwd: string,
  recentProjects: ProjectDirectory[],
): WorkdirPickerSections | null {
  const task = tasks.find((candidate) => candidate.path === cwd);
  if (!task) return null;
  const rejected = new Set<string>();
  for (const event of task.dirLog) {
    if (event.action === 'added') rejected.delete(event.dir);
    else rejected.add(event.dir);
  }
  const own = new Set(task.workDirs);
  const historyDirs = [
    ...new Set(
      tasks.filter((other) => other.path !== task.path).flatMap((other) => other.workDirs),
    ),
  ].filter((dir) => !own.has(dir) && !rejected.has(dir));
  const claimed = new Set([...own, ...historyDirs, task.path]);
  const projects = recentProjects.filter(
    (project) => !claimed.has(project.path) && !rejected.has(project.path),
  );
  return { taskDirs: task.workDirs, historyDirs, projects };
}

const sameStrings = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((dir, index) => dir === right[index]);

const sameProjects = (left: ProjectDirectory[], right: ProjectDirectory[]): boolean =>
  left.length === right.length &&
  left.every((project, index) => project.path === right[index].path);

/**
 * Content equality for ChatInput's memo: task upserts streaming in during a
 * run rebuild the sections object without changing what the picker shows.
 */
export function sameWorkdirPickerSections(
  left: WorkdirPickerSections | null | undefined,
  right: WorkdirPickerSections | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    sameStrings(left.taskDirs, right.taskDirs) &&
    sameStrings(left.historyDirs, right.historyDirs) &&
    sameProjects(left.projects, right.projects)
  );
}
