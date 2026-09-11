import { useEffect, useState } from 'react';
import { getAppInfo } from '../../services/piAgentClient';
import type { AppInfo } from '../../../../shared/ipcContract';
import type { PiSettingsSnapshot } from '../../../../shared/piSettings';
import { useAppStore } from '../../state/appStore';
import { SettingsGroup, SettingsRow, SettingsHint } from './settingsControls';

const PLATFORM_LABELS: Record<string, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  unknown: 'Unknown',
};

function PathRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <SettingsRow label={label}>
      <span className="max-w-80 truncate font-mono text-xs text-muted-foreground" title={value}>
        {value}
      </span>
    </SettingsRow>
  );
}

export function AboutSettings({
  snapshot,
  cwd,
}: {
  snapshot: PiSettingsSnapshot | null;
  cwd: string | null;
}): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const platform = useAppStore((state) => state.platform);

  useEffect(() => {
    let cancelled = false;
    void getAppInfo()
      .then((info) => {
        if (!cancelled) {
          setAppInfo(info);
        }
      })
      .catch((error) => console.error('Failed to load app info:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <SettingsGroup title="pigi">
        <SettingsRow label="Version">
          <span className="font-mono text-xs text-muted-foreground">
            {appInfo?.appVersion ?? '…'}
          </span>
        </SettingsRow>
        <SettingsRow label="Platform">
          <span className="text-xs text-muted-foreground">
            {PLATFORM_LABELS[platform] ?? platform}
          </span>
        </SettingsRow>
        <SettingsRow label="Runtime">
          <span className="font-mono text-xs text-muted-foreground">
            {appInfo
              ? `Electron ${appInfo.electronVersion} · Chromium ${appInfo.chromeVersion.split('.')[0]} · Node ${appInfo.nodeVersion}`
              : '…'}
          </span>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Pi">
        <SettingsRow label="Version">
          <span className="font-mono text-xs text-muted-foreground">
            {snapshot?.piVersion ?? '…'}
          </span>
        </SettingsRow>
        {cwd && <PathRow label="Current project" value={cwd} />}
        {snapshot && (
          <>
            <PathRow label="Agent directory" value={snapshot.paths.agentDir} />
            <PathRow label="Global settings" value={snapshot.paths.globalSettings} />
            <PathRow label="Project settings" value={snapshot.paths.projectSettings} />
            <SettingsRow
              label="Project trust"
              description="Untrusted projects keep their settings and resources disabled at runtime."
            >
              <span className="text-xs text-muted-foreground">
                {snapshot.projectTrusted ? 'Trusted' : 'Not trusted'}
              </span>
            </SettingsRow>
          </>
        )}
      </SettingsGroup>

      <SettingsHint>
        Pi settings files are shared with the pi CLI and the TUI; edits here are visible to all of
        them.
      </SettingsHint>
    </>
  );
}
