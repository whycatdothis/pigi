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
 */
import { useEffect, useState } from 'react';
import { IconLoader } from '@tabler/icons-react';
import type { UpdateStatus } from '../../../../shared/ipcContract';
import { formatFileSize } from '../../lib/chatAttachments';
import { Button } from '../ui/button';
import { SpinningIcon } from '../ui/spinningIcon';
import {
  cancelUpdateDownload,
  getUpdateStatus,
  onUpdateStatus,
  quitAndInstallUpdate,
} from '../../services/piAgentClient';

function statusTitle(status: UpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return 'Checking for updates';
    case 'downloading':
      return `Downloading pigi ${status.version}`;
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

export default function UpdateProgress(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>({ phase: 'idle' });

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

  return (
    <div className="flex h-screen flex-col gap-4 rounded-xl bg-popover/88 p-5 text-popover-foreground backdrop-blur-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-foreground/60">
          {(status.phase === 'checking' || status.phase === 'downloading') && (
            <SpinningIcon>
              <IconLoader className="size-4" />
            </SpinningIcon>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{statusTitle(status)}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {status.phase === 'downloading' && (
              <span className="tabular-nums">
                {Math.floor(status.percent)}% of {formatFileSize(status.totalBytes)} ·{' '}
                {formatFileSize(status.bytesPerSecond)}/s
              </span>
            )}
            {status.phase === 'downloaded' && 'Restart to finish installing.'}
            {status.phase === 'error' && status.message}
            {status.phase === 'checking' && 'Talking to the release server.'}
            {status.phase === 'up_to_date' && 'No newer release is published.'}
            {status.phase === 'unsupported' && 'Only a packaged, signed build can replace itself.'}
            {status.phase === 'idle' && 'Nothing is downloading right now.'}
          </div>
        </div>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full origin-left rounded-full bg-blue-500 transition-transform duration-200 ease-out"
          // A transform, not a width: the bar repaints on the compositor while
          // the main thread is busy downloading.
          style={{
            transform: `scaleX(${status.phase === 'downloading' ? status.percent / 100 : status.phase === 'downloaded' ? 1 : 0})`,
          }}
        />
      </div>

      <div className="mt-auto flex justify-end gap-2">
        {status.phase === 'downloading' && (
          <Button size="sm" variant="ghost" onClick={cancelUpdateDownload}>
            Cancel
          </Button>
        )}
        {status.phase === 'downloaded' && (
          <>
            <Button size="sm" variant="ghost" onClick={cancelUpdateDownload}>
              Later
            </Button>
            <Button size="sm" onClick={quitAndInstallUpdate}>
              Install and Restart
            </Button>
          </>
        )}
        {(status.phase === 'up_to_date' ||
          status.phase === 'error' ||
          status.phase === 'unsupported' ||
          status.phase === 'idle') && (
          <Button size="sm" variant="ghost" onClick={cancelUpdateDownload}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}
