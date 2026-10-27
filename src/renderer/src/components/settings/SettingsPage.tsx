import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
import { SpinningIcon } from '../ui/spinningIcon';
import {
  settingsSectionFor,
  type SettingsSectionEntry,
  type SettingsSectionId,
} from '../../lib/settingsSections';
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

/**
 * The page around one section: title row, scroll area, footer hint.
 *
 * The title row is a slot rather than a prop per control because the pi sections
 * fill it from their own state — scope, loading, reload — and the pigi sections
 * leave it empty.
 */
function SettingsFrame({
  title,
  actions,
  footer,
  children,
}: {
  title: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SettingsContent>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
            <div className="flex-1" />
            {actions}
          </div>
          {children}
          {footer}
        </SettingsContent>
      </div>
    </div>
  );
}

export default function SettingsPage({
  section,
  cwd,
  models,
}: SettingsPageProps): React.JSX.Element {
  // A section id can outlive the section it names (this page keeps its
  // selection in the store), so an unknown id falls back to the default rather
  // than stranding the view on an error message.
  const sectionMeta = settingsSectionFor(section);
  // Reading pi's settings means a round trip to the session worker and two
  // reads of pi's own files. Only the pi sections need it, so only they ask.
  return sectionMeta.group === 'pi' ? (
    <PiSettingsSection meta={sectionMeta} cwd={cwd} models={models} />
  ) : (
    <PigiSettingsSection meta={sectionMeta} />
  );
}

function PigiSettingsSection({ meta }: { meta: SettingsSectionEntry }): React.JSX.Element {
  let content: ReactNode = null;
  switch (meta.id) {
    case 'appearance':
      content = <AppearanceSettings />;
      break;
    case 'chat':
      content = <ChatSettings />;
      break;
    case 'shortcuts':
      content = <ShortcutsSettings />;
      break;
    default:
      content = null;
      break;
  }

  return <SettingsFrame title={meta.label}>{content}</SettingsFrame>;
}

function PiSettingsSection({
  meta,
  cwd,
  models,
}: {
  meta: SettingsSectionEntry;
  cwd: string | null;
  models: ModelInfo[];
}): React.JSX.Element {
  const { snapshot, loading, saving, isFieldSaving, reload, setUpdates } = usePiSettings(cwd);
  const [scope, setScope] = useState<PiSettingsScope>('global');
  // Sections that only touch global fields pin the scope, so values and
  // override badges always match the file being edited.
  const globalOnlySection = 'piScope' in meta && meta.piScope === 'global';
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

  const piProps: PiSectionProps = {
    scope: effectiveScope,
    values,
    isOverridden,
    setValue,
    setValues,
    isFieldSaving,
    models,
  };
  const projectUntrusted =
    !globalOnlySection && scope === 'project' && snapshot !== null && !snapshot.projectTrusted;

  let content: ReactNode = null;
  switch (meta.id) {
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
    default:
      content = null;
      break;
  }

  const unavailable = !loading && snapshot === null;

  return (
    <SettingsFrame
      title={meta.label}
      actions={
        <>
          {projectUntrusted && (
            <span
              className="max-w-72 truncate text-xs text-warning-fg"
              title="pi ignores project settings and resources until the project is trusted (see /trust in the TUI)."
            >
              Project is not trusted — these settings are ignored
            </span>
          )}
          {!globalOnlySection && (
            <SegmentedControl value={scope} options={SCOPE_OPTIONS} onChange={setScope} />
          )}
          {(loading || saving) && (
            <SpinningIcon className="text-muted-foreground">
              <IconLoader2 size={14} />
            </SpinningIcon>
          )}
          {!loading && (
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
        </>
      }
      footer={
        <SettingsHint>
          Changes are saved immediately and apply to sessions started afterwards. Run /reload in a
          running session to apply them now.
        </SettingsHint>
      }
    >
      {unavailable ? (
        <SettingsHint>
          Could not read pi settings. Check the session worker logs, then reload.
        </SettingsHint>
      ) : (
        content
      )}
    </SettingsFrame>
  );
}
