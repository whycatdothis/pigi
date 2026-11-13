/**
 * The `pigi` command for terminals outside pigi (docs/cli.md §11). Main owns the
 * link; this row asks for it, shows what it found and reports a refusal.
 */
import { useEffect, useState } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { Button } from '../ui/button';
import { SpinningIcon } from '../ui/spinningIcon';
import { SettingsGroup, SettingsHint, SettingsRow } from './settingsControls';
import type { CliInstallState } from '../../../../shared/ipcContract';

function describe(state: CliInstallState): string {
  switch (state.status) {
    case 'installed':
      return `${state.path} points at this app. Open a new terminal to use it.`;
    case 'not-installed':
      return `Puts ${state.path} on the PATH of new terminals, so scripts and other agents can drive pigi.`;
    case 'broken':
      return `${state.path} points at a launcher that is gone, usually because the app moved. Installing again fixes it.`;
    case 'conflict':
      return `${state.path} belongs to another program. Installing replaces it.`;
    case 'unsupported':
      return state.reason ?? 'This build cannot install the command.';
  }
}

export function CliSettings(): React.JSX.Element {
  const [state, setState] = useState<CliInstallState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.piApi.cli.getInstallState().then((current) => {
      if (!cancelled) setState(current);
    });
    // The menu installs and removes too, and a found change arrives here.
    const unsubscribe = window.piApi.cli.onInstallStateChanged((current) => {
      setState(current);
      setError(null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const installable = state !== null && state.status !== 'unsupported';
  const installed = state !== null && (state.status === 'installed' || state.status === 'broken');

  async function toggle(): Promise<void> {
    if (state === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.piApi.cli.setInstalled(!installed);
      setState(result.state);
      setError(result.error ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup>
        <SettingsRow
          label="The pigi command"
          description={state === null ? 'Checking…' : describe(state)}
          disabled={!installable || busy}
        >
          {busy && (
            <SpinningIcon className="text-muted-foreground">
              <IconLoader2 size={14} />
            </SpinningIcon>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!installable || busy}
            onClick={() => void toggle()}
          >
            {installed ? 'Remove' : 'Install'}
          </Button>
        </SettingsRow>
      </SettingsGroup>
      {error !== null && <SettingsHint>{error}</SettingsHint>}
      <SettingsHint>
        Sessions and the terminal panel inside pigi have it on PATH already; this is for terminals
        outside the app.
      </SettingsHint>
    </div>
  );
}
