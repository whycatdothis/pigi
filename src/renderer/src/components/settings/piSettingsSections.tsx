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
  type PiSettingValue,
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

/** One line for the list editor: the entries as the user typed them. */
function toolListValue(value: PiSettingValue | undefined): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === 'string').join(', ');
}

/** Empty commits as null, which clears the field instead of writing `[]`. */
function parseToolList(value: string | null): string[] | null {
  if (value === null) return null;
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : null;
}

/** Global-only fields cannot be written to a project file. */
function isFieldDisabled(field: PiSettingFieldId, scope: PiSettingsScope): boolean {
  return scope === 'project' && findPiSettingField(field)?.globalOnly === true;
}

/**
 * What a field does when neither settings file sets it. The info icon exists
 * because a value on its own ("On", "60000") does not say what the reader gets;
 * every entry is a sentence about the behaviour, not the number.
 */
const FIELD_UNSET_HINTS: Record<PiSettingFieldId, string> = {
  defaultProvider: 'Unset, the first provider you signed in to is used.',
  defaultModel: "Unset, the provider's first model is used.",
  defaultThinkingLevel: 'Unset, the model decides how much it thinks.',
  steeringMode: 'Unset, messages sent mid-run are handled one at a time.',
  followUpMode: 'Unset, messages queued behind the current run are handled one at a time.',
  transport: 'Unset, the transport is picked automatically.',
  httpIdleTimeoutMs: 'Unset, a request that stalls for five minutes is dropped.',
  'compaction.enabled': 'Unset, compaction runs when the context fills up.',
  'compaction.reserveTokens':
    'Unset, 16384 tokens of the window stay free for the reply and the next request.',
  'compaction.keepRecentTokens': 'Unset, the last 20000 tokens of the conversation are kept.',
  'retry.enabled': 'Unset, failed requests are retried.',
  'retry.maxRetries': 'Unset, a failed request is tried three more times.',
  'retry.baseDelayMs': 'Unset, the first retry waits two seconds, then backs off.',
  'retry.maxAgentDelayMs': 'Unset, the agent waits up to a minute before giving the turn back.',
  'retry.provider.timeoutMs': 'Unset, a provider request may run as long as it needs.',
  'retry.provider.maxRetries': 'Unset, a provider error is not retried.',
  'retry.provider.maxRetryDelayMs': "Unset, the provider's own retry delay is respected.",
  enableSkillCommands: 'Unset, skills are registered as /skill: commands.',
  extensions: 'Unset, only the extensions pi discovers itself are loaded.',
  skills: 'Unset, only the skills pi discovers itself are loaded.',
  prompts: 'Unset, only the prompt templates pi discovers itself are loaded.',
  themes: 'Unset, only the themes pi discovers itself are loaded.',
  defaultTools:
    'Unset, the agent gets read, bash, edit and write. This app adds +codemode unless you list -codemode, and writes that entry here the first time it loads the settings.',
  sessionDir: 'Unset, sessions are saved in the pi agent directory.',
  httpProxy: 'Unset, requests go out directly.',
  defaultProjectTrust: 'Unset, a project is asked about before its settings and resources load.',
  'warnings.anthropicExtraUsage':
    'Unset, the warning appears when subscription auth may use paid extra usage.',
  shellPath: 'Unset, bash runs under the login shell from the system.',
  shellCommandPrefix: 'Unset, commands run without a prefix.',
  npmCommand: 'Unset, npm is run from PATH.',
};

type FieldSettingProps = PiSectionProps & {
  field: PiSettingFieldId;
  label: string;
  description?: string;
};

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
  return (
    <SettingSourceTag
      isOverridden={isOverridden}
      scope={scope}
      onReset={onReset}
      hint={FIELD_UNSET_HINTS[field]}
    />
  );
}

/** Toggle wired to an explicit field, with a source/reset hint. */
function BooleanSetting({
  field,
  label,
  description,
  values,
  isOverridden,
  setValue,
  scope,
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
        disabled={isFieldDisabled(field, scope)}
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
        disabled={isFieldDisabled(field, scope)}
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
  step,
  suffix,
  values,
  isOverridden,
  setValue,
  scope,
}: FieldSettingProps & {
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
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
        step={step}
        label={label}
        suffix={suffix}
        placeholder={placeholder}
        disabled={isFieldDisabled(field, scope)}
        onChange={(next) => setValue(field, next)}
        onClear={() => setValue(field, null)}
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
        disabled={isFieldDisabled(field, scope)}
        monospace
        className="w-field-text"
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
          hint={FIELD_UNSET_HINTS[field]}
        />
      }
    >
      <StringListField
        value={Array.isArray(value) ? value : undefined}
        placeholder={placeholder}
        addLabel={addLabel}
        onCommit={(next) => setValue(field, next)}
      />
    </SettingsStackRow>
  );
}

export function ModelsSettings(props: PiSectionProps): React.JSX.Element {
  const { values, models, setValues } = props;
  const provider = stringValue(values, 'defaultProvider');
  const modelId = stringValue(values, 'defaultModel');
  const selectedKey = provider && modelId ? `${provider}/${modelId}` : '';
  const selectedModel = useMemo(
    () => models.find((model) => modelKey(model) === selectedKey) ?? null,
    [models, selectedKey],
  );

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
      <SettingsGroup title="Startup model">
        <SettingsRow
          label="Default model"
          description={
            models.length === 0
              ? 'No models available — check providers and credentials.'
              : undefined
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
            disabled={models.length === 0}
            className="w-field-text [&_select]:text-caption [&_select]:border-transparent [&_select]:bg-transparent dark:[&_select]:bg-transparent [&_select]:hover:bg-muted"
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
          description="Per-model overrides from /model still win."
          hint={
            <SettingSourceTag
              isOverridden={props.isOverridden('defaultThinkingLevel')}
              scope={props.scope}
              onReset={() => props.setValue('defaultThinkingLevel', null)}
              hint={FIELD_UNSET_HINTS.defaultThinkingLevel}
            />
          }
        >
          <SegmentedControl
            value={thinkingValue ?? thinkingLevels[0]}
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
    <SettingsGroup title="Message delivery">
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
        description="Only for providers that support more than one."
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
        description="0 disables it."
        min={0}
        step={1000}
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
        step={1000}
      />
      <NumberSetting
        {...props}
        field="compaction.keepRecentTokens"
        label="Keep recent tokens"
        description="Recent context that is not summarized."
        min={0}
        step={1000}
      />
    </SettingsGroup>
  );
}

export function RetrySettings(props: PiSectionProps): React.JSX.Element {
  return (
    <>
      <SettingsGroup title="Agent retries">
        <BooleanSetting {...props} field="retry.enabled" label="Enable retries" />
        <NumberSetting {...props} field="retry.maxRetries" label="Max retries" min={0} />
        <NumberSetting
          {...props}
          field="retry.baseDelayMs"
          label="Base delay"
          description="Exponential backoff starts here."
          min={0}
          step={1000}
          suffix="ms"
        />
        <NumberSetting
          {...props}
          field="retry.maxAgentDelayMs"
          label="Max agent delay"
          min={0}
          step={1000}
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
          placeholder="Default"
          min={0}
          step={1000}
          suffix="ms"
        />
        <NumberSetting {...props} field="retry.provider.maxRetries" label="Max retries" min={0} />
        <NumberSetting
          {...props}
          field="retry.provider.maxRetryDelayMs"
          label="Max server delay"
          description="Fail immediately when a provider asks to wait longer."
          min={0}
          step={1000}
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
        description="Loaded in addition to the defaults. Globs and ! exclusions work."
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
      <SettingsGroup title="Tools">
        <SettingsRow
          label="Default tools"
          description="Comma separated. Plain names replace the defaults; +name adds one and -name removes one."
          hint={
            <FieldHint
              field="defaultTools"
              scope={props.scope}
              isOverridden={props.isOverridden('defaultTools')}
              onReset={() => props.setValue('defaultTools', null)}
            />
          }
        >
          <TextField
            value={toolListValue(props.values.defaultTools)}
            placeholder="read, bash, edit, write"
            className="w-field-text"
            onCommit={(value) => props.setValue('defaultTools', parseToolList(value))}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Sessions">
        <TextSetting
          {...props}
          field="sessionDir"
          label="Session directory"
          placeholder="Default pi sessions directory"
        />
      </SettingsGroup>
      <SettingsGroup title="Shell" description="Used by the bash tool.">
        <TextSetting
          {...props}
          field="shellPath"
          label="Shell path"
          placeholder="System default shell"
        />
        <TextSetting
          {...props}
          field="shellCommandPrefix"
          label="Command prefix"
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
        />
      </SettingsGroup>
    </>
  );
}
