/**
 * The update progress window UI.
 *
 * Loaded by the standalone window created in
 * `main/windows/createUpdateProgressWindow.ts`, not by the main window: the
 * renderer entry picks this component from the location hash.
 *
 * It only ever displays the status main pushes. The buttons send a command
 * and wait for the next status — no local optimistic state, so the window
 * cannot disagree with the updater.
 *
 * The window has no height of its own: this component measures what the current
 * status needs and reports it, so the window hugs the content instead of
 * reserving a fixed box.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck, IconLoader } from '@tabler/icons-react';
import type { UpdateStatus } from '../../../../shared/ipcContract';
import { MANUAL_DOWNLOAD_URL, UP_TO_DATE_CLOSE_SECONDS } from '../../../../shared/updateWindow';
import { formatFileSize } from '../../lib/utils';
import { Button } from '../ui/button';
import { SpinningIcon } from '../ui/spinningIcon';
import appIconUrl from '../../assets/appIcon.png';
import {
  cancelUpdateDownload,
  dismissUpdateWindow,
  getUpdateStatus,
  onUpdateStatus,
  quitAndInstallUpdate,
  setUpdateProgressContentHeight,
} from '../../services/piAgentClient';

function statusTitle(status: UpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return 'Checking for updates…';
    case 'downloading':
      return `Downloading pigi ${status.version}…`;
    case 'downloaded':
      return `pigi ${status.version} is ready`;
    case 'installing':
      return `Restarting to install pigi ${status.version}…`;
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
      return 'Install and restart to finish.';
    case 'installing':
      return 'pigi quits and reopens when the install is done.';
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
  // The first frame of a download knows the version but not the size yet;
  // "0 B of 0 B" is worse than no line for the moment it takes to arrive.
  if (status.totalBytes === 0) return null;
  return `${formatFileSize(status.transferredBytes)} of ${formatFileSize(status.totalBytes)}`;
}

function barPercent(status: UpdateStatus): number | null {
  return status.phase === 'downloading' ? status.percent / 100 : null;
}

/**
 * Counts down the seconds until the window closes itself, so it leaving is
 * something the user was told about rather than a surprise. Mounted only while
 * "up to date" is on screen, so it starts from the top each time.
 */
function ClosingHint(): React.JSX.Element {
  const [seconds, setSeconds] = useState(UP_TO_DATE_CLOSE_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((current) => (current > 1 ? current - 1 : current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="shrink-0 text-2xs text-muted-foreground/70">auto closing in {seconds}s</span>
  );
}

const SECONDARY_BUTTON =
  'rounded-full bg-foreground/6 hover:bg-foreground/10 dark:hover:bg-foreground/12';
/**
 * The one action that finishes the update. The fill is `primary`, the role the
 * appearance model fits for a filled button (the accent, dark enough for its
 * label); `system-accent` is the text/ornament accent and would leave white on
 * a bright blue in dark mode. Hover keeps every colour as it is.
 */
const PRIMARY_BUTTON =
  'rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary';

export default function UpdateProgress(): React.JSX.Element | null {
  // Null until the first status arrives: a manual check opens this window at the
  // start of the check, and a frame of "Nothing to download" before "Checking
  // for updates" would read as a flicker.
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStatus = status !== null;

  useEffect(() => {
    let active = true;
    // A push that lands before the read comes back is the newer truth; the
    // answer to `getStatus` would only put the window back where it was.
    let sawPush = false;
    const unsubscribe = onUpdateStatus((next) => {
      sawPush = true;
      setStatus(next);
    });
    void getUpdateStatus()
      .then((current) => {
        if (active && !sawPush) setStatus(current);
      })
      .catch((error) => console.error('Failed to read update status:', error));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Escape closes the window without touching the download.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dismissUpdateWindow();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // The window follows its content's height as the status grows from one line
  // to a progress bar or a wrapped error. Keyed on whether there is a status at
  // all: the first paint has no ref to measure, and ticking download progress
  // must not rebuild the observer.
  useLayoutEffect(() => {
    if (!hasStatus) return undefined;
    const container = containerRef.current;
    if (container === null) return undefined;

    setUpdateProgressContentHeight(container.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      // The entry's own measurement, rather than reading layout again on every
      // frame: this runs while a download pushes progress several times a
      // second.
      const blockSize = entry.borderBoxSize[0]?.blockSize;
      setUpdateProgressContentHeight(blockSize ?? entry.contentRect.height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [hasStatus]);

  if (status === null) return null;

  const percent = barPercent(status);
  const detail = statusDetail(status);
  const bytes = transferredLabel(status);
  const isWorking = status.phase === 'checking' || status.phase === 'installing';

  // The action sits under the status, not beside it: the row above belongs to
  // the update, and a button on its right squeezes the text at 400px.
  let action: React.JSX.Element | null = null;
  if (status.phase === 'downloading') {
    action = (
      <Button size="sm" variant="ghost" className={SECONDARY_BUTTON} onClick={cancelUpdateDownload}>
        Cancel
      </Button>
    );
  } else if (status.phase === 'downloaded') {
    action = (
      <Button size="sm" className={PRIMARY_BUTTON} onClick={quitAndInstallUpdate}>
        Install and Restart
      </Button>
    );
  } else if (status.phase === 'error') {
    action = (
      <Button
        size="sm"
        variant="ghost"
        className={SECONDARY_BUTTON}
        onClick={() => window.piApi.openExternal(MANUAL_DOWNLOAD_URL)}
      >
        Download
      </Button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-3 bg-background px-4 py-3.5 text-foreground"
    >
      <div className="flex items-center gap-3">
        <img
          src={appIconUrl}
          alt=""
          className="size-10 shrink-0 rounded-control shadow-sm ring-1 ring-black/5"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-center gap-1.5">
            {isWorking && (
              <SpinningIcon>
                <IconLoader className="size-3.5 text-foreground/45" />
              </SpinningIcon>
            )}
            <span className="truncate text-caption leading-5 font-semibold">
              {statusTitle(status)}
            </span>
            {status.phase === 'up_to_date' && (
              <>
                <IconCheck
                  className="size-4 shrink-0 text-[var(--system-accent)]"
                  strokeWidth={2.5}
                />
                <ClosingHint />
              </>
            )}
          </div>

          {detail !== null && (
            <div className="line-clamp-2 text-caption leading-4 break-words text-muted-foreground">
              {detail}
            </div>
          )}

          {percent !== null && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent * 100)}
              aria-label="Update download"
              className="mt-0.5 h-[5px] w-full overflow-hidden rounded-full bg-foreground/10"
            >
              <div
                className="h-full origin-left rounded-full bg-[var(--system-accent)] transition-transform duration-200 ease-out"
                // A transform, not a width: the bar repaints on the compositor
                // while the main thread is busy downloading.
                style={{ transform: `scaleX(${percent})` }}
              />
            </div>
          )}

          {bytes !== null && (
            <span className="text-2xs leading-4 tabular-nums text-muted-foreground">{bytes}</span>
          )}
        </div>
      </div>

      {action !== null && <div className="flex justify-end">{action}</div>}
    </div>
  );
}
