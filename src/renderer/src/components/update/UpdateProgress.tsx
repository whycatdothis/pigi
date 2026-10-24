/**
 * The update progress window UI.
 *
 * Loaded by the standalone window created in
 * `main/windows/createUpdateProgressWindow.ts`, not by the main window: the
 * renderer entry picks this component from the location hash.
 *
 * It only ever displays the status main pushes. Cancel and Install send a
 * command and wait for the next status — no local optimistic state, so the
 * window cannot disagree with the updater.
 *
 * The window has no height of its own: this component measures what the current
 * status needs and reports it, so the window hugs the content instead of
 * reserving a fixed box.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck, IconLoader } from '@tabler/icons-react';
import type { UpdateStatus } from '../../../../shared/ipcContract';
import { formatFileSize } from '../../lib/chatAttachments';
import { Button } from '../ui/button';
import { SpinningIcon } from '../ui/spinningIcon';
import appIconUrl from '../../assets/appIcon.png';
import {
  cancelUpdateDownload,
  getUpdateStatus,
  onUpdateStatus,
  quitAndInstallUpdate,
  setUpdateProgressWindowHeight,
} from '../../services/piAgentClient';

function statusTitle(status: UpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return 'Checking for updates…';
    case 'downloading':
      return `Downloading pigi ${status.version}…`;
    case 'downloaded':
      return `pigi ${status.version} is ready`;
    case 'up_to_date':
      return 'pigi is up to date';
    case 'error':
      return 'Update failed';
    case 'unsupported':
      return 'Updates need the packaged app';
    case 'idle':
      return 'Nothing to download';
  }
}

function statusDetail(status: UpdateStatus): string | null {
  switch (status.phase) {
    case 'downloaded':
      return 'Restart pigi to finish installing.';
    case 'error':
      return status.message;
    case 'unsupported':
      return 'Only a packaged, signed build can replace itself.';
    case 'idle':
      return 'Nothing is downloading right now.';
    default:
      return null;
  }
}

/** The byte count under the bar while a download runs. */
function transferredLabel(status: UpdateStatus): string | null {
  if (status.phase !== 'downloading') return null;
  return `${formatFileSize(status.transferredBytes)} of ${formatFileSize(status.totalBytes)}`;
}

/** What the bar shows: the download's progress, or full once it has landed. */
function barPercent(status: UpdateStatus): number | null {
  if (status.phase === 'downloading') return status.percent / 100;
  if (status.phase === 'downloaded') return 1;
  return null;
}

const SECONDARY_BUTTON =
  'rounded-full bg-foreground/6 hover:bg-foreground/10 dark:hover:bg-foreground/12';
const ACCENT_BUTTON =
  'rounded-full bg-[var(--system-accent)] font-medium text-white hover:bg-[var(--system-accent)]/90';

export default function UpdateProgress(): React.JSX.Element | null {
  // Null until the first status arrives: a manual check opens this window at the
  // start of the check, and a frame of "Nothing to download" before "Checking
  // for updates" would read as a flicker.
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void getUpdateStatus()
      .then((current) => {
        if (active) setStatus(current);
      })
      .catch((error) => console.error('Failed to read update status:', error));
    const unsubscribe = onUpdateStatus(setStatus);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Reporting the measured height on every change keeps the window the same
  // size as its content as the status moves from one line to a bar and buttons.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const report = (): void => {
      setUpdateProgressWindowHeight(container.getBoundingClientRect().height);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (status === null) return null;

  const percent = barPercent(status);
  const detail = statusDetail(status);
  const bytes = transferredLabel(status);
  const hasFooter =
    status.phase === 'downloading' ||
    status.phase === 'downloaded' ||
    status.phase === 'up_to_date';

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-3 bg-popover px-4 py-3.5 text-popover-foreground"
    >
      <img
        src={appIconUrl}
        alt=""
        className="size-11 shrink-0 rounded-[10px] shadow-sm ring-1 ring-black/5"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <div className="flex items-center gap-1.5">
          {status.phase === 'checking' && (
            <SpinningIcon>
              <IconLoader className="size-3.5 text-foreground/45" />
            </SpinningIcon>
          )}
          <span className="truncate text-[13px] leading-5 font-semibold">
            {statusTitle(status)}
          </span>
          {status.phase === 'up_to_date' && (
            <>
              <IconCheck
                className="size-4 shrink-0 text-[var(--system-accent)]"
                strokeWidth={2.5}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground/70">auto closing…</span>
            </>
          )}
        </div>

        {detail !== null && (
          <div className="line-clamp-2 text-xs leading-4 text-muted-foreground">{detail}</div>
        )}

        {percent !== null && (
          <div className="h-[5px] w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full origin-left rounded-full bg-[var(--system-accent)] transition-transform duration-200 ease-out"
              // A transform, not a width: the bar repaints on the compositor
              // while the main thread is busy downloading.
              style={{ transform: `scaleX(${percent})` }}
            />
          </div>
        )}

        {hasFooter && (
          <div className="flex items-center gap-1.5">
            {bytes !== null && (
              <span className="text-[11px] tabular-nums text-muted-foreground">{bytes}</span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {status.phase === 'downloading' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className={SECONDARY_BUTTON}
                  onClick={cancelUpdateDownload}
                >
                  Cancel
                </Button>
              )}
              {status.phase === 'downloaded' && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={SECONDARY_BUTTON}
                    onClick={cancelUpdateDownload}
                  >
                    Later
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={ACCENT_BUTTON}
                    onClick={quitAndInstallUpdate}
                  >
                    Install and Restart
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
