/**
 * Pi settings sections. Every field maps to the registry in
 * `src/shared/piSettings.ts`; labels and help text live here.
 */
import { useMemo } from 'react';
import type { ModelInfo } from '../../../../shared/ipcContract';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '../ui/native-select';
import { Switch } from '../ui/switch';
import {
  NumberField,
  SegmentedControl,
  SettingSourceTag,
  SettingsGroup,
  SettingsRow,
  SettingsStackRow,
  StringListField,
  TextField,
} from './settingsControls';
import type { PiSectionProps } from './piSectionProps';
import {
  findPiSettingField,
  type PiSettingFieldId,
  type PiSettingsScope,
} from '../../../../shared/piSettings';

const THINKING_LEVEL_OPTIONS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

function modelKey(model: ModelInfo): string {
  return `${model.provider}/${model.id}`;
}

function stringValue(
  values: PiSectionProps['values'],
  field: PiSettingFieldId,
): string | undefined {
  const value = values[field];
  return typeof value === 'string' ? value : undefined;
}

/** Global-only fields cannot be written to a project file; a write in flight disables its own fields only. */
function isFieldDisabled(
  field: PiSettingFieldId,
  scope: PiSettingsScope,
  isFieldSaving: PiSectionProps['isFieldSaving'],
): boolean {
  return (
    isFieldSaving(field, scope) ||
    (scope === 'project' && findPiSettingField(field)?.globalOnly === true)
  );
}

/** Source tag, or a "Global only" note for fields with no project form. */
function FieldHint({
  field,
  scope,
  isOverridden,
  onReset,
}: {
  field: PiSettingFieldId;
  scope: PiSettingsScope;
  isOverridden: boolean;
  onReset: () => void;
}): React.JSX.Element {
  if (findPiSettingField(field)?.globalOnly === true) {
    return <span className="text-caption text-muted-foreground/70">Global only</span>;
  }
  return <SettingSourceTag isOverridden={isOverridden} scope={scope} onReset={onReset} />;
}

type FieldSettingProps = PiSectionProps & {
  field: PiSettingFieldId;
  label: string;
  description?: string;
};

/** Toggle wired to an explicit field, with a source/reset hint. */
function BooleanSetting({
  field,
  label,
  description,
  values,
  isOverridden,
  setValue,
  scope,
  isFieldSaving,
}: FieldSettingProps): React.JSX.Element {
  return (
    <SettingsRow
      label={label}
      description={description}
      hint={
        <FieldHint
          field={field}
          scope={scope}
          isOverridden={isOverridden(field)}
          onReset={() => setValue(field, null)}
        />
      }
    >
      <Switch
        checked={values[field] === true}
        disabled={isFieldDisabled(field, scope, isFieldSaving)}
        onCheckedChange={(checked) => setValue(field, checked)}
      />
    </SettingsRow>
  );
}

function EnumSetting<T extends string>({
  field,
  label,
  description,
  options,
  values,
  isOverridden,
  setValue,
  scope,
  isFieldSaving,
}: FieldSettingProps & {
  options: readonly { value: T; label: string }[];
}): React.JSX.Element {
  const current = stringValue(values, field);
  return (
    <SettingsRow
      label={label}
      description={description}
      hint={
        <FieldHint
          field={field}
          scope={scope}
          isOverridden={isOverridden(field)}
          onReset={() => setValue(field, null)}
        />
      }
    >
      <SegmentedControl
        value={current ?? (options[0]?.value as T)}
        options={options}
        disabled={isFieldDisabled(field, scope, isFieldSaving)}
        onChange={(value) => setValue(field, value)}
      />
    </SettingsRow>
  );
}

function NumberSetting({
  field,
  label,
  description,
  placeholder,
  min,
  max,
  suffix,
  values,
  isOverridden,
  setValue,
  scope,
  isFieldSaving,
}: FieldSettingProps & {
  placeholder?: string;
  min?: number;
  max?: number;
  suffix?: string;
}): React.JSX.Element {
  const value = values[field];
  // The registry declares what a write may carry; the field clamps to the same
  // range so the control cannot produce a value the worker would refuse.
  const bounds = findPiSettingField(field);
  return (
    <SettingsRow
      label={label}
      description={description}
      hint={
        <FieldHint
          field={field}
          scope={scope}
          isOverridden={isOverridden(field)}
          onReset={() => setValue(field, null)}
        />
      }
    >
      <NumberField
        value={typeof value === 'number' ? value : undefined}
        min={min ?? bounds?.min}
        max={max ?? bounds?.max}
        suffix={suffix}
        placeholder={placeholder}
        disabled={isFieldDisabled(field, scope, isFieldSaving)}
        onCommit={(next) => setValue(field, next)}
      />
    </SettingsRow>
  );
}

function TextSetting({
  field,
  label,
  description,
  placeholder,
  values,
  isOverridden,
  setValue,
  scope,
  isFieldSaving,
}: FieldSettingProps & { placeholder?: string }): React.JSX.Element {
  return (
    <SettingsRow
      label={label}
      description={description}
      hint={
        <FieldHint
          field={field}
          scope={scope}
          isOverridden={isOverridden(field)}
          onReset={() => setValue(field, null)}
        />
      }
    >
      <TextField
        value={stringValue(values, field)}
        placeholder={placeholder}
        disabled={isFieldDisabled(field, scope, isFieldSaving)}
        monospace
        className="w-72"
        onCommit={(next) => setValue(field, next)}
      />
    </SettingsRow>
  );
}

function ListSetting({
  field,
  label,
  description,
  placeholder,
  addLabel,
  values,
  isOverridden,
  setValue,
  scope,
  isFieldSaving,
}: FieldSettingProps & { placeholder?: string; addLabel: string }): React.JSX.Element {
  const value = values[field];
  return (
    <SettingsStackRow
      label={label}
      description={description}
      hint={
        <SettingSourceTag
          isOverridden={isOverridden(field)}
          scope={scope}
          onReset={() => setValue(field, null)}
        />
      }
    >
      <StringListField
        value={Array.isArray(value) ? value : undefined}
        placeholder={placeholder}
        disabled={isFieldDisabled(field, scope, isFieldSaving)}
        addLabel={addLabel}
        onCommit={(next) => setValue(field, next)}
      />
    </SettingsStackRow>
  );
}

export function ModelsSettings(props: PiSectionProps): React.JSX.Element {
  const { values, models, setValues, scope, isFieldSaving } = props;
  const provider = stringValue(values, 'defaultProvider');
  const modelId = stringValue(values, 'defaultModel');
  const selectedKey = provider && modelId ? `${provider}/${modelId}` : '';
  const selectedModel = useMemo(
    () => models.find((model) => modelKey(model) === selectedKey) ?? null,
    [models, selectedKey],
  );

  // Group the catalog by provider for a scannable select.
  const providers = useMemo(() => {
    const grouped = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const list = grouped.get(model.provider) ?? [];
      list.push(model);
      grouped.set(model.provider, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [models]);

  const thinkingLevels =
    selectedModel && selectedModel.thinkingLevels.length > 0
      ? selectedModel.thinkingLevels
      : THINKING_LEVEL_OPTIONS;
  const thinkingValue = stringValue(values, 'defaultThinkingLevel');

  return (
    <>
      <SettingsGroup
        title="Startup model"
        description="Used when pi starts a new session without an explicit model."
      >
        <SettingsRow
          label="Default model"
          description={
            models.length === 0
              ? 'No models available — check providers and credentials.'
              : 'The model new sessions start with.'
          }
          hint={
            modelId ? (
              <button
                type="button"
                className="text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  setValues([
                    { field: 'defaultProvider', value: null },
                    { field: 'defaultModel', value: null },
                  ]);
                }}
              >
                Reset
              </button>
            ) : null
          }
        >
          <NativeSelect
            value={selectedKey}
            // One write carries both fields, so either of them in flight disables
            // the pair; a thinking-level write leaves the select usable.
            disabled={
              models.length === 0 ||
              isFieldSaving('defaultProvider', scope) ||
              isFieldSaving('defaultModel', scope)
            }
            className="w-72 [&_select]:text-caption [&_select]:border-transparent [&_select]:bg-transparent dark:[&_select]:bg-transparent [&_select]:hover:bg-muted"
            onChange={(event) => {
              const nextKey = event.target.value;
              if (!nextKey) {
                setValues([
                  { field: 'defaultProvider', value: null },
                  { field: 'defaultModel', value: null },
                ]);
                return;
              }
              const model = models.find((candidate) => modelKey(candidate) === nextKey);
              if (model) {
                setValues([
                  { field: 'defaultProvider', value: model.provider },
                  { field: 'defaultModel', value: model.id },
                ]);
              }
            }}
          >
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {providers.map(([providerName, providerModels]) => (
              <NativeSelectOptGroup key={providerName} label={providerName}>
                {providerModels.map((model) => (
                  <NativeSelectOption key={modelKey(model)} value={modelKey(model)}>
                    {model.name}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        </SettingsRow>

        <SettingsRow
          label="Default thinking level"
          description="Applied at startup; per-model overrides from /model still win."
          hint={
            <SettingSourceTag
              isOverridden={props.isOverridden('defaultThinkingLevel')}
              scope={props.scope}
              onReset={() => props.setValue('defaultThinkingLevel', null)}
            />
          }
        >
          <SegmentedControl
            value={thinkingValue ?? thinkingLevels[0]}
            disabled={isFieldDisabled('defaultThinkingLevel', scope, isFieldSaving)}
            options={thinkingLevels.map((level) => ({ value: level, label: level }))}
            onChange={(level) => props.setValue('defaultThinkingLevel', level)}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

export function DeliverySettings(props: PiSectionProps): React.JSX.Element {
  return (
    <SettingsGroup
      title="Message delivery"
      description="How queued messages reach a running agent."
    >
      <EnumSetting
        {...props}
        field="steeringMode"
        label="Steering messages"
        description="Messages sent while the agent is working."
        options={[
          { value: 'one-at-a-time', label: 'One at a time' },
          { value: 'all', label: 'All at once' },
        ]}
      />
      <EnumSetting
        {...props}
        field="followUpMode"
        label="Follow-up messages"
        description="Messages queued for after the current response."
        options={[
          { value: 'one-at-a-time', label: 'One at a time' },
          { value: 'all', label: 'All at once' },
        ]}
      />
      <EnumSetting
        {...props}
        field="transport"
        label="Transport"
        description="Preferred transport for providers that support more than one."
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'sse', label: 'SSE' },
          { value: 'websocket', label: 'WebSocket' },
          { value: 'websocket-cached', label: 'WS cached' },
        ]}
      />
      <NumberSetting
        {...props}
        field="httpIdleTimeoutMs"
        label="HTTP idle timeout"
        description="Abort a request when no data arrives for this long. 0 disables it."
        min={0}
        suffix="ms"
      />
    </SettingsGroup>
  );
}

export function CompactionSettings(props: PiSectionProps): React.JSX.Element {
  return (
    <SettingsGroup
      title="Auto-compaction"
      description="Summarize old context when the window fills up."
    >
      <BooleanSetting {...props} field="compaction.enabled" label="Enable auto-compaction" />
      <NumberSetting
        {...props}
        field="compaction.reserveTokens"
        label="Reserve tokens"
        description="Tokens kept free for the model's response."
        min={0}
      />
      <NumberSetting
        {...props}
        field="compaction.keepRecentTokens"
        label="Keep recent tokens"
        description="Recent context that is not summarized."
        min={0}
      />
    </SettingsGroup>
  );
}

export function RetrySettings(props: PiSectionProps): React.JSX.Element {
  return (
    <>
      <SettingsGroup title="Agent retries" description="Retry transient failures automatically.">
        <BooleanSetting {...props} field="retry.enabled" label="Enable retries" />
        <NumberSetting {...props} field="retry.maxRetries" label="Max retries" min={0} />
        <NumberSetting
          {...props}
          field="retry.baseDelayMs"
          label="Base delay"
          description="Exponential backoff starts here."
          min={0}
          suffix="ms"
        />
        <NumberSetting
          {...props}
          field="retry.maxAgentDelayMs"
          label="Max agent delay"
          description="Longest wait between agent-level retries."
          min={0}
          suffix="ms"
        />
      </SettingsGroup>
      <SettingsGroup
        title="Provider retries"
        description="Low-level request retries. Leave max retries at 0 unless needed."
      >
        <NumberSetting
          {...props}
          field="retry.provider.timeoutMs"
          label="Request timeout"
          placeholder="SDK default"
          min={0}
          suffix="ms"
        />
        <NumberSetting {...props} field="retry.provider.maxRetries" label="Max retries" min={0} />
        <NumberSetting
          {...props}
          field="retry.provider.maxRetryDelayMs"
          label="Max server delay"
          description="Fail immediately when a provider asks to wait longer."
          min={0}
          suffix="ms"
        />
      </SettingsGroup>
    </>
  );
}

export function ResourcesSettings(props: PiSectionProps): React.JSX.Element {
  return (
    <>
      <SettingsGroup title="Skills">
        <BooleanSetting
          {...props}
          field="enableSkillCommands"
          label="Skill commands"
          description="Register skills as /skill:name commands."
        />
      </SettingsGroup>
      <SettingsGroup
        title="Resource paths"
        description="Extra files or directories pi loads in addition to the defaults. Globs and ! exclusions are supported."
      >
        <ListSetting
          {...props}
          field="extensions"
          label="Extensions"
          placeholder="path/to/extension.ts"
          addLabel="Add extension path"
        />
        <ListSetting
          {...props}
          field="skills"
          label="Skills"
          placeholder="path/to/skills"
          addLabel="Add skill path"
        />
        <ListSetting
          {...props}
          field="prompts"
          label="Prompt templates"
          placeholder="path/to/prompts"
          addLabel="Add prompt path"
        />
        <ListSetting
          {...props}
          field="themes"
          label="Themes"
          placeholder="path/to/theme.json"
          addLabel="Add theme path"
        />
      </SettingsGroup>
    </>
  );
}

export function AdvancedSettings(props: PiSectionProps): React.JSX.Element {
  return (
    <>
      <SettingsGroup title="Sessions">
        <TextSetting
          {...props}
          field="sessionDir"
          label="Session directory"
          description="Where session files are stored. Absolute, relative, or ~ paths."
          placeholder="Default pi sessions directory"
        />
      </SettingsGroup>
      <SettingsGroup title="Shell" description="Used by the bash tool.">
        <TextSetting
          {...props}
          field="shellPath"
          label="Shell path"
          description="Custom shell binary, e.g. for Cygwin on Windows."
          placeholder="System default shell"
        />
        <TextSetting
          {...props}
          field="shellCommandPrefix"
          label="Command prefix"
          description="Prepended to every bash command."
          placeholder="e.g. shopt -s expand_aliases"
        />
        <ListSetting
          {...props}
          field="npmCommand"
          label="npm command"
          description="Argv used for npm package operations."
          placeholder="npm"
          addLabel="Add argv entry"
        />
      </SettingsGroup>
      <SettingsGroup title="Network">
        <TextSetting
          {...props}
          field="httpProxy"
          label="HTTP proxy"
          description="Applied as HTTP_PROXY and HTTPS_PROXY."
          placeholder="http://127.0.0.1:7890"
        />
      </SettingsGroup>
      <SettingsGroup title="Security">
        <EnumSetting
          {...props}
          field="defaultProjectTrust"
          label="Project trust fallback"
          description="Used in non-interactive runs when no saved trust decision exists."
          options={[
            { value: 'ask', label: 'Ask' },
            { value: 'always', label: 'Always' },
            { value: 'never', label: 'Never' },
          ]}
        />
        <BooleanSetting
          {...props}
          field="warnings.anthropicExtraUsage"
          label="Anthropic extra usage warning"
          description="Warn when subscription auth may use paid extra usage."
        />
      </SettingsGroup>
    </>
  );
}
