/**
 * Pi settings field registry and pure helpers.
 *
 * The registry is the exposure boundary of the settings page: the session
 * worker uses it to flatten `settings.json` files and to validate writes, the
 * renderer uses it to render controls. Fields that are not listed here are
 * preserved untouched in the files and are never read or written by pigi.
 *
 * Field ids are dotted paths into the JSON document (`compaction.enabled`).
 * `globalOnly` marks settings that pi itself only reads from the global file.
 */

/** Value shapes pigi can read from and write to pi settings files. */
export type PiSettingValue = boolean | string | number | readonly string[];

export type PiSettingType = 'boolean' | 'string' | 'number' | 'stringList' | 'enum';

export interface PiSettingField {
  /** Dotted path into settings.json, e.g. `compaction.enabled`. */
  id: string;
  type: PiSettingType;
  /** Allowed values for `enum` fields. */
  options?: readonly string[];
  /** Bounds for `number` fields; a write outside them is refused. */
  min?: number;
  max?: number;
  /** Only meaningful in `~/.pi/agent/settings.json`. */
  globalOnly?: boolean;
  /** Built-in value pi uses when the field is absent (display only). */
  defaultValue?: PiSettingValue;
}

/** A day, in milliseconds: longer than any timeout a provider would ask for. */
const MAX_TIMEOUT_MS = 86_400_000;
/** Retries beyond this are a loop, not a retry policy. */
const MAX_RETRIES = 100;
/** Ten million tokens is already past every model's context window. */
const MAX_TOKEN_COUNT = 10_000_000;
/** Resource lists hold paths; a thousand of them is a broken settings file. */
const MAX_STRING_LIST_ITEMS = 1_000;
const MAX_STRING_LIST_ITEM_LENGTH = 4_096;

export const PI_SETTING_FIELDS = [
  // Models & thinking (global only: these are startup defaults).
  { id: 'defaultProvider', type: 'string', globalOnly: true },
  { id: 'defaultModel', type: 'string', globalOnly: true },
  {
    id: 'defaultThinkingLevel',
    type: 'enum',
    options: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    globalOnly: true,
  },
  // Message delivery.
  {
    id: 'steeringMode',
    type: 'enum',
    options: ['all', 'one-at-a-time'],
    defaultValue: 'one-at-a-time',
  },
  {
    id: 'followUpMode',
    type: 'enum',
    options: ['all', 'one-at-a-time'],
    defaultValue: 'one-at-a-time',
  },
  {
    id: 'transport',
    type: 'enum',
    options: ['auto', 'sse', 'websocket', 'websocket-cached'],
    defaultValue: 'auto',
  },
  { id: 'httpIdleTimeoutMs', type: 'number', defaultValue: 300000, min: 0, max: MAX_TIMEOUT_MS },
  // Compaction.
  { id: 'compaction.enabled', type: 'boolean', defaultValue: true },
  {
    id: 'compaction.reserveTokens',
    type: 'number',
    defaultValue: 16384,
    min: 0,
    max: MAX_TOKEN_COUNT,
  },
  {
    id: 'compaction.keepRecentTokens',
    type: 'number',
    defaultValue: 20000,
    min: 0,
    max: MAX_TOKEN_COUNT,
  },
  // Retry.
  { id: 'retry.enabled', type: 'boolean', defaultValue: true },
  { id: 'retry.maxRetries', type: 'number', defaultValue: 3, min: 0, max: MAX_RETRIES },
  { id: 'retry.baseDelayMs', type: 'number', defaultValue: 2000, min: 0, max: MAX_TIMEOUT_MS },
  {
    id: 'retry.maxAgentDelayMs',
    type: 'number',
    defaultValue: 60000,
    min: 0,
    max: MAX_TIMEOUT_MS,
  },
  { id: 'retry.provider.timeoutMs', type: 'number', min: 0, max: MAX_TIMEOUT_MS },
  { id: 'retry.provider.maxRetries', type: 'number', defaultValue: 0, min: 0, max: MAX_RETRIES },
  {
    id: 'retry.provider.maxRetryDelayMs',
    type: 'number',
    defaultValue: 60000,
    min: 0,
    max: MAX_TIMEOUT_MS,
  },
  // Resources.
  { id: 'enableSkillCommands', type: 'boolean', defaultValue: true },
  { id: 'extensions', type: 'stringList', defaultValue: [] },
  { id: 'skills', type: 'stringList', defaultValue: [] },
  { id: 'prompts', type: 'stringList', defaultValue: [] },
  { id: 'themes', type: 'stringList', defaultValue: [] },
  // Advanced.
  { id: 'sessionDir', type: 'string', globalOnly: true },
  { id: 'httpProxy', type: 'string', globalOnly: true },
  {
    id: 'defaultProjectTrust',
    type: 'enum',
    options: ['ask', 'always', 'never'],
    globalOnly: true,
    defaultValue: 'ask',
  },
  { id: 'warnings.anthropicExtraUsage', type: 'boolean', defaultValue: true },
  { id: 'shellPath', type: 'string' },
  { id: 'shellCommandPrefix', type: 'string' },
  { id: 'npmCommand', type: 'stringList', defaultValue: [] },
] as const satisfies readonly PiSettingField[];

export type PiSettingFieldId = (typeof PI_SETTING_FIELDS)[number]['id'];

/** Registry widened to the declared field type (the literal tuple narrows too far). */
const PI_SETTING_FIELD_LIST: readonly PiSettingField[] = PI_SETTING_FIELDS;

/** Present settings values keyed by field id; absent means "not set in this scope". */
export type PiSettingsValues = Partial<Record<PiSettingFieldId, PiSettingValue>>;

/** One field to write; `value: null` clears it from the scope. */
export interface PiSettingUpdate {
  field: PiSettingFieldId;
  value: PiSettingValue | null;
}

/** Built-in defaults for every field that declares one. */
export function piSettingDefaults(): PiSettingsValues {
  const defaults: PiSettingsValues = {};
  for (const field of PI_SETTING_FIELD_LIST) {
    if (field.defaultValue !== undefined && isPiSettingFieldId(field.id)) {
      defaults[field.id] = field.defaultValue;
    }
  }
  return defaults;
}

export type PiSettingsScope = 'global' | 'project';

export interface PiSettingsSnapshot {
  global: PiSettingsValues;
  project: PiSettingsValues;
  /** Absolute paths shown in the UI (and used by the worker for writes). */
  paths: {
    agentDir: string;
    globalSettings: string;
    projectSettings: string;
  };
  /** False when pi would ignore this project's settings.json at runtime. */
  projectTrusted: boolean;
  piVersion: string;
}

export interface PiSettingsResult {
  success: boolean;
  error?: string;
  snapshot?: PiSettingsSnapshot;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Type guard for values that can travel through the IPC contract. */
export function isPiSettingValue(value: unknown): value is PiSettingValue {
  if (typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function findPiSettingField(id: string): PiSettingField | undefined {
  return PI_SETTING_FIELD_LIST.find((field) => field.id === id);
}

export function isPiSettingFieldId(value: string): value is PiSettingFieldId {
  return findPiSettingField(value) !== undefined;
}

/** Read a dotted path from a parsed settings document. Invalid shapes read as unset. */
export function getPiSettingValue(source: unknown, fieldId: string): PiSettingValue | undefined {
  const segments = fieldId.split('.');
  let current: unknown = source;
  for (const segment of segments) {
    if (!isPlainRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return isPiSettingValue(current) ? current : undefined;
}

/**
 * Write a dotted path into a parsed settings document. `undefined` deletes the
 * key and prunes parents that become empty, so clearing a field leaves no
 * residue behind.
 */
export function setPiSettingValue(
  target: Record<string, unknown>,
  fieldId: string,
  value: PiSettingValue | undefined,
): void {
  setNestedValue(target, fieldId.split('.'), value);
}

function setNestedValue(
  target: Record<string, unknown>,
  segments: readonly string[],
  value: PiSettingValue | undefined,
): void {
  const [head, ...rest] = segments;
  if (rest.length === 0) {
    if (value === undefined) {
      delete target[head];
    } else {
      target[head] = value;
    }
    return;
  }

  if (value === undefined) {
    const child = target[head];
    if (!isPlainRecord(child)) {
      return;
    }
    setNestedValue(child, rest, undefined);
    if (Object.keys(child).length === 0) {
      delete target[head];
    }
    return;
  }

  const existing = target[head];
  let child: Record<string, unknown>;
  if (isPlainRecord(existing)) {
    child = existing;
  } else {
    child = {};
    target[head] = child;
  }
  setNestedValue(child, rest, value);
}

/** Flatten the registry fields out of one parsed settings document. */
export function extractPiSettingsValues(source: object): PiSettingsValues {
  const values: PiSettingsValues = {};
  for (const field of PI_SETTING_FIELD_LIST) {
    if (!isPiSettingFieldId(field.id)) {
      continue;
    }
    const value = getPiSettingValue(source, field.id);
    if (value !== undefined) {
      values[field.id] = value;
    }
  }
  return values;
}

/** Validate an incoming write against the field's declared type. */
export function isPiSettingValueValid(field: PiSettingField, value: PiSettingValue): boolean {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return false;
      }
      return (
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max)
      );
    case 'enum':
      return typeof value === 'string' && (field.options ?? []).includes(value);
    case 'stringList':
      return (
        Array.isArray(value) &&
        value.length <= MAX_STRING_LIST_ITEMS &&
        value.every(
          (entry) => typeof entry === 'string' && entry.length <= MAX_STRING_LIST_ITEM_LENGTH,
        )
      );
  }
}
