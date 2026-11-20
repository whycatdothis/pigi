import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const SHELL_LOGIN_INTERACTIVE_FLAGS = ['-i', '-l'];
const SHELL_COMMAND_FLAG = '-c';
const DETECTION_TIMEOUT_MS = 5000;
const WINDOWS_PLATFORM = 'win32';

/**
 * Env vars to import from the user's shell config into the app process.
 * GUI apps inherit only a minimal environment from launchd, so anything that
 * must match the terminal goes here, resolved from the interactive login shell.
 */
export const DO_NOT_TRACK_ENV = 'DO_NOT_TRACK';
const SHELL_ENV_ALLOWLIST = [
  'PI_SUBAGENT_PI_BINARY',
  'PI_CURSOR_SETTING_SOURCES',
  DO_NOT_TRACK_ENV,
  // Where go to definition looks for gopls besides PATH.
  'GOBIN',
  'GOPATH',
] as const;

/**
 * Run a probe and return its stdout, or null on any failure or timeout.
 *
 * stdin is `/dev/null`, not a pipe: execFile's default leaves stdin open, so a
 * `.zshrc` that reads it (a prompt, a `read -q`) blocks until the timeout —
 * measured 5s for a command that answers at once, against the whole point of
 * resolving in the background.
 */
function runProbe(command: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let stdout = '';
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, DETECTION_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 ? stdout : null));
  });
}

async function getUserShellFromDirectoryService(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null;
  }
  const stdout = await runProbe('dscl', [
    '.',
    '-read',
    `/Users/${process.env['USER']}`,
    'UserShell',
  ]);
  const match = stdout?.trim().match(/UserShell:\s*(.+)/);
  return match?.[1]?.trim() || null;
}

async function getShellCandidates(): Promise<string[]> {
  const shell = process.env['SHELL'];
  const dsclShell = await getUserShellFromDirectoryService();
  const commonShells = [
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
    '/usr/local/bin/fish',
    '/opt/homebrew/bin/fish',
  ];
  return [...new Set([shell, dsclShell, ...commonShells])].filter(
    (candidate): candidate is string => Boolean(candidate && existsSync(candidate)),
  );
}

/**
 * Print PATH and allowlisted variables as KEY=VALUE lines.
 * printf %s keeps values from being interpreted as shell escapes; quoting
 * prevents word splitting and glob expansion on spaces or wildcards in PATH.
 */
function buildShellProbeCommand(isFish: boolean): string {
  const variableProbes = SHELL_ENV_ALLOWLIST.map(
    (name) => `printf '${name}=%s\\n' "$${name}"`,
  ).join('; ');
  const pathProbe = isFish
    ? 'printf "PATH=%s\\n" (string join : $PATH)'
    : 'printf "PATH=%s\\n" "$PATH"';
  return `${variableProbes}; ${pathProbe}`;
}

/**
 * On macOS, /Applications apps inherit a minimal PATH
 * (just /usr/bin:/bin:/usr/sbin:/sbin), so interactive login shells source the
 * user's config (.zprofile + .zshrc) to pick up tools like brew and npm.
 *
 * Tries all available shells, merges PATH entries across them, and keeps the
 * first non-empty value for each allowlisted variable.
 */
async function resolveShellEnv(): Promise<{
  pathDirs: string[];
  envVars: Record<string, string>;
} | null> {
  if (process.platform === WINDOWS_PLATFORM) {
    return null;
  }

  const candidates = await getShellCandidates();
  const pathDirs: string[] = [];
  const envVars: Record<string, string> = {};

  for (const shell of candidates) {
    const isFish = shell.includes('fish');
    const shellArgs = isFish
      ? [SHELL_COMMAND_FLAG, buildShellProbeCommand(isFish)]
      : [...SHELL_LOGIN_INTERACTIVE_FLAGS, SHELL_COMMAND_FLAG, buildShellProbeCommand(isFish)];
    const stdout = await runProbe(shell, shellArgs);
    if (stdout === null) {
      continue;
    }
    for (const line of stdout.trim().split(/\r?\n/)) {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }
      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      if (key === 'PATH') {
        for (const dir of value.split(':')) {
          if (dir && !pathDirs.includes(dir)) {
            pathDirs.push(dir);
          }
        }
      } else if (
        SHELL_ENV_ALLOWLIST.some((name) => name === key) &&
        value !== '' &&
        envVars[key] === undefined
      ) {
        envVars[key] = value;
      }
    }
  }

  return pathDirs.length > 0 || Object.keys(envVars).length > 0 ? { pathDirs, envVars } : null;
}

let shellEnvPromise: Promise<void> | null = null;

/**
 * Resolve the shell environment into `process.env` once per process. Never
 * rejects: on failure the inherited environment stays, which is no worse than
 * never resolving. Callers that fork with `process.env` await this so
 * resolution overlaps window creation instead of blocking the launch.
 */
export function initializeShellEnv(): Promise<void> {
  shellEnvPromise ??= applyShellEnv();
  return shellEnvPromise;
}

async function applyShellEnv(): Promise<void> {
  try {
    const shellEnv = await resolveShellEnv();
    if (!shellEnv) {
      return;
    }
    if (shellEnv.pathDirs.length > 0) {
      process.env['PATH'] = shellEnv.pathDirs.join(':');
    }
    for (const [key, value] of Object.entries(shellEnv.envVars)) {
      process.env[key] = value;
    }
  } catch (error) {
    console.error('Shell environment resolution failed; keeping the inherited environment:', error);
  }
}
