import type { ModelInfo } from '../../../../shared/ipcContract';
import type {
  PiSettingFieldId,
  PiSettingsScope,
  PiSettingsValues,
  PiSettingUpdate,
  PiSettingValue,
} from '../../../../shared/piSettings';

/** Props every pi settings section receives from the settings page. */
export interface PiSectionProps {
  /** Scope currently being edited (global, or project with global fallback shown). */
  scope: PiSettingsScope;
  /** Effective values for the active scope (defaults + global + project). */
  values: PiSettingsValues;
  /** True when the active scope's file sets the field explicitly. */
  isOverridden: (field: PiSettingFieldId) => boolean;
  /** Write a field to the active scope; null clears it from that scope. */
  setValue: (field: PiSettingFieldId, value: PiSettingValue | null) => void;
  /** Write several fields in one locked read-modify-write. */
  setValues: (updates: PiSettingUpdate[]) => void;
  /** True while a write of this field in this scope is in flight. */
  isFieldSaving: (field: PiSettingFieldId, scope: PiSettingsScope) => boolean;
  /** Global model catalog for the models section. */
  models: ModelInfo[];
}
