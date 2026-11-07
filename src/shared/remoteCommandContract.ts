/**
 * The public contract of the `pigi` CLI and its socket (docs/cli.md §6).
 *
 * The CLI parser and the server validator both read `REMOTE_METHODS`, so a
 * flag the CLI accepts is a param the app checks. Everything exported here is
 * a contract: change it additively only, and a breaking change is a new method
 * name. `remoteCommandContract.test.ts` snapshots the surface.
 */
import type { ThinkingLevel } from './ipcContract';
import { THINKING_LEVEL_ORDER } from './thinkingLevels';

/** Bumped only by a breaking transport change; methods evolve by name. */
export const REMOTE_PROTOCOL_VERSION = 1;

export const PIGI_SOCKET_ENV = 'PIGI_SOCKET';
export const PIGI_SESSION_ENV = 'PIGI_SESSION';

/** A request line over this many bytes closes the connection. */
export const REMOTE_MAX_LINE_BYTES = 1024 * 1024;

/** The custom session entry that marks a session started by `pigi subagent`. */
export const SUBAGENT_ENTRY_TYPE = 'pigi.subagent';
export interface SubagentEntryData {
  version: 1;
  /** The marked session's own id: a fork copies the entry but not the id. */
  sessionId: string;
}

export interface RemoteParamSpec {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  /** The CLI flag, when it is not the param name. */
  flag?: string;
  /** Allowed values of a string param. */
  values?: readonly string[];
  /** A file or directory: the CLI resolves it against its working directory. */
  filesystemPath?: boolean;
  description: string;
}

export interface RemoteMethodSpec {
  /** Words after `pigi`, e.g. `session create`. */
  command: string;
  description: string;
  /** Params taken as positional CLI arguments, in order. */
  positional?: readonly string[];
  params: Readonly<Record<string, RemoteParamSpec>>;
}

const MODEL_PARAM: RemoteParamSpec = {
  type: 'string',
  description: 'provider/model-id; defaults to the parent session’s current model',
};

const THINKING_PARAM: RemoteParamSpec = {
  type: 'string',
  flag: 'thinking',
  values: THINKING_LEVEL_ORDER,
  description: 'thinking level; an unsupported level falls back to the nearest one',
};

export const REMOTE_METHODS = {
  'system.hello': {
    command: 'ping',
    description: 'Check that pigi is running and print its version',
    params: {},
  },
  'session.list': {
    command: 'session list',
    description: 'List the sessions of a project',
    params: {
      cwd: {
        type: 'string',
        required: true,
        filesystemPath: true,
        description: 'project directory; defaults to the current one',
      },
    },
  },
  'session.create': {
    command: 'session create',
    description: 'Create a session in the background and print its path',
    params: {
      cwd: {
        type: 'string',
        filesystemPath: true,
        description: 'project directory; defaults to the parent’s, else the current one',
      },
      parent: {
        type: 'string',
        filesystemPath: true,
        description: 'session file the new session links to',
      },
      model: MODEL_PARAM,
      thinkingLevel: THINKING_PARAM,
    },
  },
  'session.prompt': {
    command: 'session prompt',
    description: 'Send a prompt to an idle session',
    positional: ['path', 'text'],
    params: {
      path: { type: 'string', required: true, filesystemPath: true, description: 'session file' },
      text: { type: 'string', required: true, description: 'prompt text; - reads stdin' },
    },
  },
  'session.wait': {
    command: 'session wait',
    description: 'Wait until a session is idle and print its last reply',
    positional: ['path'],
    params: {
      path: { type: 'string', required: true, filesystemPath: true, description: 'session file' },
      timeout: { type: 'number', description: 'seconds to wait before giving up' },
    },
  },
  'subagent.run': {
    command: 'subagent',
    description: 'Run a task in a fresh child session of this one and print its reply',
    positional: ['task'],
    params: {
      task: { type: 'string', required: true, description: 'the task; - reads stdin' },
      parent: {
        type: 'string',
        required: true,
        filesystemPath: true,
        description: 'parent session file; defaults to the session running this command',
      },
      model: MODEL_PARAM,
      thinkingLevel: THINKING_PARAM,
      detach: {
        type: 'boolean',
        description: 'print the child path and return without waiting',
      },
    },
  },
} as const satisfies Record<string, RemoteMethodSpec>;

export type RemoteMethod = keyof typeof REMOTE_METHODS;

export function isRemoteMethod(method: string): method is RemoteMethod {
  return Object.hasOwn(REMOTE_METHODS, method);
}

export interface ThinkingLevelChoice {
  /** What was asked for or inherited; null when the app default applied. */
  requested: ThinkingLevel | null;
  /** What the session runs with after clamping to the model. */
  effective: ThinkingLevel | null;
}

export interface RemoteSessionSummary {
  path: string;
  id: string;
  cwd: string;
  title: string;
  parentPath: string | null;
  isSubagent: boolean;
  running: boolean;
  created: string;
  modified: string;
  messageCount: number;
}

export interface RemoteSessionCreated {
  path: string;
  /** `provider/id`. */
  model: string | null;
  thinkingLevel: ThinkingLevelChoice;
}

export interface RemoteSessionReply {
  path: string;
  reply: string;
  stopReason: string;
}

export interface RemoteParams {
  'system.hello': Record<string, never>;
  'session.list': { cwd: string };
  'session.create': {
    cwd?: string;
    parent?: string;
    model?: string;
    thinkingLevel?: ThinkingLevel;
  };
  'session.prompt': { path: string; text: string };
  'session.wait': { path: string; timeout?: number };
  'subagent.run': {
    task: string;
    parent: string;
    model?: string;
    thinkingLevel?: ThinkingLevel;
    detach?: boolean;
  };
}

export interface RemoteResults {
  'system.hello': {
    protocolVersion: number;
    appVersion: string;
    methods: RemoteMethod[];
  };
  'session.list': { sessions: RemoteSessionSummary[] };
  'session.create': RemoteSessionCreated;
  'session.prompt': { path: string };
  'session.wait': RemoteSessionReply;
  /** Without `reply` and `stopReason` when detached. */
  'subagent.run': RemoteSessionCreated & Partial<RemoteSessionReply>;
}

/** Server → client notification sent once the child exists, before it runs. */
export const SUBAGENT_STARTED_NOTIFICATION = 'subagent.started';

/**
 * JSON-RPC error codes. The number is the contract; `data.code` repeats it as
 * a string for readers that do not want to keep a table.
 */
export const RemoteErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNSUPPORTED_PARAM: -32000,
  APP_NOT_READY: -32001,
  NOT_FOUND: -32002,
  /** The session errored or was aborted; `data` carries the partial reply. */
  SESSION_FAILED: -32003,
  /** `session wait` gave up; the session is still running (CLI exit 4). */
  TIMEOUT: -32004,
  SESSION_BUSY: -32005,
} as const;

export type RemoteErrorName = keyof typeof RemoteErrorCode;

export interface RemoteErrorData {
  code: RemoteErrorName;
  param?: string;
  path?: string;
  reply?: string;
  stopReason?: string;
}

export interface RemoteError {
  code: number;
  message: string;
  data: RemoteErrorData;
}

export function remoteError(
  name: RemoteErrorName,
  message: string,
  data: Omit<RemoteErrorData, 'code'> = {},
): RemoteError {
  return { code: RemoteErrorCode[name], message, data: { code: name, ...data } };
}

export type RemoteParamsResult =
  | { ok: true; params: Record<string, string | number | boolean> }
  | { ok: false; error: RemoteError };

/**
 * Checks params against the method spec. Strict: an unknown param is an error
 * rather than ignored, so a newer CLI's flag never silently does nothing
 * against an older app.
 */
export function parseRemoteParams(method: RemoteMethod, raw: unknown): RemoteParamsResult {
  const spec: RemoteMethodSpec = REMOTE_METHODS[method];
  if (raw === undefined) raw = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: remoteError('INVALID_PARAMS', 'params must be an object') };
  }
  const params: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(raw)) {
    const param = spec.params[name];
    if (!param) {
      return {
        ok: false,
        error: remoteError('UNSUPPORTED_PARAM', `${method} does not take "${name}"`, {
          param: name,
        }),
      };
    }
    if (value === undefined || value === null) continue;
    const valid =
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
      typeof value === param.type &&
      value !== '' &&
      (typeof value !== 'number' || Number.isFinite(value));
    if (!valid) {
      return {
        ok: false,
        error: remoteError('INVALID_PARAMS', `"${name}" must be a non-empty ${param.type}`, {
          param: name,
        }),
      };
    }
    if (param.values && !param.values.includes(String(value))) {
      return {
        ok: false,
        error: remoteError(
          'INVALID_PARAMS',
          `"${name}" must be one of ${param.values.join(', ')}`,
          { param: name },
        ),
      };
    }
    params[name] = value;
  }
  for (const [name, param] of Object.entries(spec.params)) {
    if (param.required && params[name] === undefined) {
      return {
        ok: false,
        error: remoteError('INVALID_PARAMS', `"${name}" is required`, { param: name }),
      };
    }
  }
  return { ok: true, params };
}

/** `provider/id`, split at the first slash: OpenRouter ids contain slashes. */
export function splitModelRef(ref: string): { provider: string; modelId: string } | null {
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1) return null;
  return { provider: ref.slice(0, slash), modelId: ref.slice(slash + 1) };
}
