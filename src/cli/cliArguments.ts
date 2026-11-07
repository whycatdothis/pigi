/**
 * `pigi` argument parsing, derived from `REMOTE_METHODS`: every command is a
 * method, every flag a param. Pure, so it is tested without a socket.
 */
import { resolve } from 'node:path';
import {
  PIGI_SESSION_ENV,
  REMOTE_METHODS,
  isRemoteMethod,
  type RemoteMethod,
  type RemoteMethodSpec,
  type RemoteParamSpec,
} from '../shared/remoteCommandContract';

export type CliParams = Record<string, string | number | boolean>;

export type CliInvocation =
  | { kind: 'help'; text: string }
  | { kind: 'usage_error'; message: string }
  | {
      kind: 'call';
      method: RemoteMethod;
      params: CliParams;
      json: boolean;
      /** The param whose value is `-`: read it from stdin. */
      stdinParam: string | null;
    };

interface CliEnvironment {
  cwd: string;
  env: Record<string, string | undefined>;
}

const METHOD_ENTRIES = Object.keys(REMOTE_METHODS)
  .filter(isRemoteMethod)
  .map((method): [RemoteMethod, RemoteMethodSpec] => [method, REMOTE_METHODS[method]]);

/** `session.create` alone: links the new session to the one running the command. */
const PARENT_SELF_FLAG = 'parent-self';

function flagName(name: string, param: RemoteParamSpec): string {
  return param.flag ?? name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function usageLine(spec: RemoteMethodSpec): string {
  const positional = new Set(spec.positional ?? []);
  const parts = [`pigi ${spec.command}`];
  for (const name of spec.positional ?? []) parts.push(`<${name}>`);
  for (const [name, param] of Object.entries(spec.params)) {
    if (positional.has(name)) continue;
    const flag = `--${flagName(name, param)}`;
    parts.push(param.type === 'boolean' ? `[${flag}]` : `[${flag} <${param.type}>]`);
  }
  return parts.join(' ');
}

export function generalHelp(): string {
  const lines = ['Usage: pigi <command> [options]', '', 'Commands:'];
  for (const [, spec] of METHOD_ENTRIES) {
    lines.push(`  ${spec.command.padEnd(16)}${spec.description}`);
  }
  lines.push(
    '',
    'Every command takes --json and --help.',
    '',
    'Exit codes: 0 success, 1 failed, 2 usage error, 3 pigi not reachable,',
    '4 still running (session wait --timeout ran out).',
  );
  return lines.join('\n');
}

export function commandHelp(method: RemoteMethod): string {
  const spec: RemoteMethodSpec = REMOTE_METHODS[method];
  const lines = [`Usage: ${usageLine(spec)}`, '', spec.description, ''];
  for (const [name, param] of Object.entries(spec.params)) {
    const label = spec.positional?.includes(name) ? `<${name}>` : `--${flagName(name, param)}`;
    const values = param.values ? ` (${param.values.join(', ')})` : '';
    lines.push(`  ${label.padEnd(18)}${param.description}${values}`);
  }
  if (method === 'session.create') {
    lines.push(`  ${`--${PARENT_SELF_FLAG}`.padEnd(18)}link to the session running this command`);
  }
  lines.push(`  ${'--json'.padEnd(18)}print the structured result`);
  return lines.join('\n');
}

function findMethod(words: string[]): { method: RemoteMethod; rest: string[] } | null {
  let best: { method: RemoteMethod; length: number } | null = null;
  for (const [method, spec] of METHOD_ENTRIES) {
    const commandWords = spec.command.split(' ');
    const matches = commandWords.every((word, index) => words[index] === word);
    if (matches && (!best || commandWords.length > best.length)) {
      best = { method, length: commandWords.length };
    }
  }
  return best ? { method: best.method, rest: words.slice(best.length) } : null;
}

function coerce(param: RemoteParamSpec, raw: string): string | number | null {
  if (param.type !== 'number') return raw;
  const value = Number(raw);
  return raw.trim() !== '' && Number.isFinite(value) ? value : null;
}

export function parseCliArguments(argv: string[], context: CliEnvironment): CliInvocation {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    return { kind: 'help', text: generalHelp() };
  }
  const found = findMethod(argv);
  if (!found) {
    return { kind: 'usage_error', message: `unknown command: ${argv.join(' ')}` };
  }
  const { method, rest } = found;
  const spec: RemoteMethodSpec = REMOTE_METHODS[method];
  const byFlag = new Map<string, [string, RemoteParamSpec]>();
  for (const [name, param] of Object.entries(spec.params)) {
    byFlag.set(flagName(name, param), [name, param]);
  }

  const params: CliParams = {};
  const positional: string[] = [];
  let json = false;
  let parentSelf = false;
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index];
    if (argument === '--help' || argument === '-h') {
      return { kind: 'help', text: commandHelp(method) };
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (method === 'session.create' && argument === `--${PARENT_SELF_FLAG}`) {
      parentSelf = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }
    const equals = argument.indexOf('=');
    const flag = argument.slice(2, equals === -1 ? undefined : equals);
    const entry = byFlag.get(flag);
    if (!entry) {
      return { kind: 'usage_error', message: `unknown option --${flag} for ${spec.command}` };
    }
    const [name, param] = entry;
    if (param.type === 'boolean') {
      if (equals !== -1) {
        return { kind: 'usage_error', message: `--${flag} takes no value` };
      }
      params[name] = true;
      continue;
    }
    const raw = equals === -1 ? rest[++index] : argument.slice(equals + 1);
    if (raw === undefined) {
      return { kind: 'usage_error', message: `--${flag} needs a value` };
    }
    const value = coerce(param, raw);
    if (value === null) {
      return { kind: 'usage_error', message: `--${flag} must be a number` };
    }
    params[name] = value;
  }

  const positionalNames = spec.positional ?? [];
  if (positional.length > positionalNames.length) {
    return {
      kind: 'usage_error',
      message: `too many arguments for ${spec.command}; quote text that has spaces`,
    };
  }
  positional.forEach((value, index) => {
    params[positionalNames[index]] = value;
  });

  const callerSession = context.env[PIGI_SESSION_ENV];
  if (parentSelf) {
    if (!callerSession) {
      return { kind: 'usage_error', message: `--${PARENT_SELF_FLAG} needs ${PIGI_SESSION_ENV}` };
    }
    params.parent = callerSession;
  }
  if (method === 'subagent.run' && params.parent === undefined) {
    if (!callerSession) {
      return {
        kind: 'usage_error',
        message: `pigi subagent runs inside a pigi session (${PIGI_SESSION_ENV} is not set); pass --parent <session file>`,
      };
    }
    params.parent = callerSession;
  }
  if (method === 'session.list' && params.cwd === undefined) params.cwd = context.cwd;
  if (method === 'session.create' && params.cwd === undefined && params.parent === undefined) {
    params.cwd = context.cwd;
  }

  let stdinParam: string | null = null;
  for (const [name, param] of Object.entries(spec.params)) {
    const value = params[name];
    if (value === undefined) {
      if (param.required) {
        return { kind: 'usage_error', message: `missing <${name}>\n${usageLine(spec)}` };
      }
      continue;
    }
    if (value === '-' && param.type === 'string' && !param.filesystemPath) {
      stdinParam = name;
    } else if (param.filesystemPath && typeof value === 'string') {
      params[name] = resolve(context.cwd, value);
    }
  }
  return { kind: 'call', method, params, json, stdinParam };
}
