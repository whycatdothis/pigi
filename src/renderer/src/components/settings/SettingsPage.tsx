import { useCallback, useMemo, useState } from 'react';
import { IconLoader2, IconRefresh } from '@tabler/icons-react';
import type { ModelInfo } from '../../../../shared/ipcContract';
import {
  piSettingDefaults,
  type PiSettingFieldId,
  type PiSettingsScope,
  type PiSettingUpdate,
  type PiSettingValue,
} from '../../../../shared/piSettings';
import { usePiSettings } from '../../hooks/usePiSettings';
import { SegmentedControl, SettingsContent, SettingsHint } from './settingsControls';
import { findSettingsSection, type SettingsSectionId } from './settingsSections';
import type { PiSectionProps } from './piSectionProps';
import {
  AdvancedSettings,
  CompactionSettings,
  DeliverySettings,
  ModelsSettings,
  ResourcesSettings,
  RetrySettings,
} from './piSettingsSections';
import { AppearanceSettings } from './appearanceSettings';
import { ChatSettings } from './chatSettings';
import { ShortcutsSettings } from './shortcutsSettings';
import { AboutSettings } from './aboutSettings';

interface SettingsPageProps {
  section: SettingsSectionId;
  /** Active project cwd used for the project scope. */
  cwd: string | null;
  /** Global model catalog for the models section. */
  models: ModelInfo[];
}

const SCOPE_OPTIONS = [
  { value: 'global' as const, label: 'Global' },
  { value: 'project' as const, label: 'This project' },
];

export default function SettingsPage({
  section,
  cwd,
  models,
}: SettingsPageProps): React.JSX.Element {
  const sectionMeta = findSettingsSection(section);
  const { snapshot, loading, saving, reload, setUpdates } = usePiSettings(cwd);
  const [scope, setScope] = useState<PiSettingsScope>('global');
  // Sections that only touch global fields pin the scope, so values and
  // override badges always match the file being edited.
  const globalOnlySection = sectionMeta?.piScope === 'global';
  const effectiveScope: PiSettingsScope = globalOnlySection ? 'global' : scope;

  const defaults = useMemo(() => piSettingDefaults(), []);

  // Global scope shows the file's values; project scope resolves through
  // global to the built-in defaults, matching pi's merge order.
  const values = useMemo(() => {
    if (!snapshot) {
      return defaults;
    }
    return effectiveScope === 'global'
      ? { ...defaults, ...snapshot.global }
      : { ...defaults, ...snapshot.global, ...snapshot.project };
  }, [defaults, snapshot, effectiveScope]);

  const isOverridden = useCallback(
    (field: PiSettingFieldId): boolean => {
      if (!snapshot) {
        return false;
      }
      const source = effectiveScope === 'global' ? snapshot.global : snapshot.project;
      return Object.prototype.hasOwnProperty.call(source, field);
    },
    [snapshot, effectiveScope],
  );

  const setValues = useCallback(
    (updates: PiSettingUpdate[]) => {
      void setUpdates(effectiveScope, updates);
    },
    [effectiveScope, setUpdates],
  );

  const setValue = useCallback(
    (field: PiSettingFieldId, value: PiSettingValue | null) => {
      setValues([{ field, value }]);
    },
    [setValues],
  );

  if (!sectionMeta) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Unknown settings section.
      </div>
    );
  }

  const isPiSection = sectionMeta.group === 'pi';
  const piProps: PiSectionProps = {
    scope: effectiveScope,
    values,
    isOverridden,
    setValue,
    setValues,
    saving,
    models,
  };
  const projectUntrusted =
    isPiSection &&
    !globalOnlySection &&
    scope === 'project' &&
    snapshot !== null &&
    !snapshot.projectTrusted;

  let content: React.ReactNode;
  switch (section) {
    case 'models':
      content = <ModelsSettings {...piProps} />;
      break;
    case 'delivery':
      content = <DeliverySettings {...piProps} />;
      break;
    case 'compaction':
      content = <CompactionSettings {...piProps} />;
      break;
    case 'retry':
      content = <RetrySettings {...piProps} />;
      break;
    case 'resources':
      content = <ResourcesSettings {...piProps} />;
      break;
    case 'advanced':
      content = <AdvancedSettings {...piProps} />;
      break;
    case 'appearance':
      content = <AppearanceSettings />;
      break;
    case 'chat':
      content = <ChatSettings />;
      break;
    case 'shortcuts':
      content = <ShortcutsSettings />;
      break;
    case 'about':
      content = <AboutSettings snapshot={snapshot} cwd={cwd} />;
      break;
  }

  const piContentUnavailable = isPiSection && !loading && snapshot === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SettingsContent>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {sectionMeta.label}
            </h1>
            <div className="flex-1" />
            {projectUntrusted && (
              <span
                className="max-w-72 truncate text-xs text-warning-fg"
                title="pi ignores project settings and resources until the project is trusted (see /trust in the TUI)."
              >
                Project is not trusted — these settings are ignored
              </span>
            )}
            {isPiSection && !globalOnlySection && (
              <SegmentedControl value={scope} options={SCOPE_OPTIONS} onChange={setScope} />
            )}
            {isPiSection && (loading || saving) && (
              <IconLoader2 size={14} className="animate-spin text-muted-foreground" />
            )}
            {isPiSection && !loading && (
              <button
                type="button"
                onClick={reload}
                title="Reload from disk"
                aria-label="Reload settings from disk"
                className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconRefresh size={14} />
              </button>
            )}
          </div>
          {piContentUnavailable ? (
            <SettingsHint>
              Could not read pi settings. Check the session worker logs, then reload.
            </SettingsHint>
          ) : (
            content
          )}
          {isPiSection && (
            <SettingsHint>
              Changes are saved immediately and apply to sessions started afterwards. Run /reload in
              a running session to apply them now.
            </SettingsHint>
          )}
        </SettingsContent>
      </div>
    </div>
  );
}
