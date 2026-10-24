import type { UpdateStatus } from '../../shared/ipcContract';

/**
 * What a published status means for the progress window.
 *
 * This is the whole lifetime of that window, kept as a function of the status so
 * it can be tested without Electron: the window itself only knows how to open,
 * resize, count down and close.
 */
export type UpdateWindowAction =
  /** Show the answer, then take it away after the linger. */
  | 'schedule-close'
  /** Close now: the caller is reporting this failure somewhere else. */
  | 'close'
  /** Leave the window where it is, and drop any countdown it was running. */
  | 'keep';

interface UpdateWindowContext {
  /** True when the user asked for this check, rather than a background one. */
  manualCheck: boolean;
}

export function updateWindowAction(
  next: UpdateStatus,
  { manualCheck }: UpdateWindowContext,
): UpdateWindowAction {
  switch (next.phase) {
    case 'up_to_date':
      // The window announces it; hold it long enough to be read.
      return 'schedule-close';
    case 'error':
      // A check the user asked for also toasts in the main window, so the
      // progress window has nothing left to do. A background one has no toast:
      // leave the message on screen and let the red button dismiss it.
      return manualCheck ? 'close' : 'keep';
    default:
      // Progress, or an answer with buttons of its own.
      return 'keep';
  }
}
