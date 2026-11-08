import { useSettingsStore } from '../../state/settingsStore';
import { Switch } from '../ui/switch';
import { SettingsGroup, SettingsRow } from './settingsControls';

const PRIVACY_URL = 'https://pigi.pink/privacy';

export function PrivacySettings(): React.JSX.Element {
  const telemetryEnabled = useSettingsStore((state) => state.telemetry.enabled);
  const setTelemetryEnabled = useSettingsStore((state) => state.setTelemetryEnabled);

  return (
    <SettingsGroup>
      <SettingsRow
        label="Share anonymous usage data"
        description="Crash reports and usage counts. Never includes your prompts or code."
        hint={
          <button
            type="button"
            onClick={() => window.piApi.openExternal(PRIVACY_URL)}
            className="text-caption text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            What is sent
          </button>
        }
      >
        <Switch
          aria-label="Share anonymous usage data"
          checked={telemetryEnabled}
          onCheckedChange={setTelemetryEnabled}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
