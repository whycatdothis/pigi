/**
 * `pigi` on the PATH of terminals outside pigi (docs/cli.md §11).
 *
 * Installing is one symlink into a directory a login shell searches anyway:
 * nothing is copied, no shell rc is edited, and the link keeps pointing at the
 * launcher inside the bundle, so an auto-update that replaces the bundle in
 * place needs no reinstall.
 */
import { app, dialog, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { getMainWindow } from '../windows/createMainWindow';
import { launcherDirectory } from '../remoteControl/remoteControlServer';
import {
  PiChannel,
  type CliInstallResult,
  type CliInstallState,
  type CliInstallStatus,
} from '../../shared/ipcContract';

const execFileAsync = promisify(execFile);

/** In `/etc/paths`, so no shell rc has to change. */
const INSTALL_DIRECTORY = '/usr/local/bin';
const COMMAND_NAME = 'pigi';

/**
 * What the install path holds: a symlink and where it points, a file some other
 * program owns, or nothing.
 */
type InstalledEntry = { kind: 'link'; target: string } | { kind: 'other' } | { kind: 'absent' };

let stateObserver: (() => void) | null = null;

function commandPath(): string {
  return join(INSTALL_DIRECTORY, COMMAND_NAME);
}

function launcherPath(): string {
  return join(launcherDirectory(), COMMAND_NAME);
}

function installedEntry(path: string): InstalledEntry {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      const target = readlinkSync(path);
      // A link made by hand may be relative to the directory it sits in.
      return { kind: 'link', target: isAbsolute(target) ? target : resolve(dirname(path), target) };
    }
    return { kind: 'other' };
  } catch {
    return { kind: 'absent' };
  }
}

/**
 * A launcher inside an installed bundle. Any bundle path counts: after the app
 * moves, the link still holds the old one and is ours to replace, not another
 * program's file.
 */
const LAUNCHER_SUFFIX = 'app.asar.unpacked/resources/bin/pigi';

function isOurLauncher(target: string): boolean {
  return resolve(target).endsWith(LAUNCHER_SUFFIX);
}

/**
 * Exported for the test: the rule that decides whether the command is already
 * ours, someone else's, or pointing at a bundle that moved.
 */
export function installStatusOf(entry: InstalledEntry, launcher: string): CliInstallStatus {
  switch (entry.kind) {
    case 'absent':
      return 'not-installed';
    case 'other':
      return 'conflict';
    case 'link': {
      if (!isOurLauncher(entry.target)) return 'conflict';
      const current = resolve(entry.target) === resolve(launcher) && existsSync(entry.target);
      return current ? 'installed' : 'broken';
    }
  }
}

/** Why no install is possible here, or null when it is. */
function unsupportedReason(): string | null {
  if (process.platform !== 'darwin') {
    return 'Installing the command from inside the app is macOS only.';
  }
  if (!app.isPackaged) {
    // A dev build's launcher points at `out/` and the dev Electron; a link to it
    // would break as soon as the build is stale.
    return 'The development build has no installed app to link to; its sessions already have pigi on PATH.';
  }
  if (!existsSync(launcherPath())) return 'This app bundle has no pigi launcher.';
  if (app.getAppPath().includes('/AppTranslocation/')) {
    return 'pigi is running from a temporary copy; move it to Applications first.';
  }
  return null;
}

export function cliInstallState(): CliInstallState {
  const path = commandPath();
  const reason = unsupportedReason();
  if (reason !== null) return { status: 'unsupported', path, target: null, reason };
  const entry = installedEntry(path);
  return {
    status: installStatusOf(entry, launcherPath()),
    path,
    target: entry.kind === 'link' ? entry.target : null,
  };
}

function isPermissionError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
  return code === 'EACCES' || code === 'EPERM';
}

/** A single-quoted shell word: a path with spaces or quotes stays one word. */
function shellQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

/** A double-quoted AppleScript string. */
function appleScriptQuote(text: string): string {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

/**
 * Runs a shell command with the administrator password prompt. `/usr/local/bin`
 * is root-owned on a stock Mac, and AppleScript is the only way an app asks for
 * that without its own privileged helper.
 */
async function runAsAdministrator(command: string): Promise<void> {
  const script = `do shell script ${appleScriptQuote(command)} with administrator privileges`;
  await execFileAsync('osascript', ['-e', script]);
}

/** Replaces whatever is at the path with a link to the launcher. */
async function replaceCommandLink(launcher: string): Promise<void> {
  const path = commandPath();
  try {
    await mkdir(INSTALL_DIRECTORY, { recursive: true });
    await rm(path, { force: true });
    await symlink(launcher, path);
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    await runAsAdministrator(
      `/bin/mkdir -p ${shellQuote(INSTALL_DIRECTORY)} && /bin/ln -sfn ${shellQuote(launcher)} ${shellQuote(path)}`,
    );
  }
}

async function removeCommandLink(): Promise<void> {
  const path = commandPath();
  try {
    await rm(path, { force: true });
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    await runAsAdministrator(`/bin/rm -f ${shellQuote(path)}`);
  }
}

/** What went wrong, in the one line a settings row has room for. */
function describeError(error: unknown): string {
  const stderr = typeof error === 'object' && error !== null ? Reflect.get(error, 'stderr') : null;
  const detail = typeof stderr === 'string' ? stderr.trim() : '';
  // osascript's -128 is the password prompt being cancelled, not a failure.
  if (detail.includes('(-128)')) return 'Cancelled.';
  if (detail) return detail;
  const message = error instanceof Error ? error.message : String(error);
  // execFile puts the whole command line in its message; the row has no room.
  return message.startsWith('Command failed:')
    ? 'The command did not run; nothing changed.'
    : message;
}

export async function setCliCommandInstalled(installed: boolean): Promise<CliInstallResult> {
  const before = cliInstallState();
  if (before.status === 'unsupported') return { state: before };
  // Only a link this app wrote is ever removed; anything else stays put.
  const ours = before.status === 'installed' || before.status === 'broken';
  if (!installed && !ours) return { state: before };
  if (installed && before.status === 'conflict') {
    const answer = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Replace', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `"pigi" already exists at ${before.path}`,
      detail: 'It does not belong to this app. Replacing it removes it.',
    });
    if (answer.response !== 0) return { state: before };
  }
  try {
    if (installed) await replaceCommandLink(launcherPath());
    else await removeCommandLink();
  } catch (error) {
    return { state: cliInstallState(), error: describeError(error) };
  }
  return { state: publish(cliInstallState()) };
}

function publish(state: CliInstallState): CliInstallState {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(PiChannel.CliInstallStateChanged, state);
  }
  stateObserver?.();
  return state;
}

export interface CliMenuItemState {
  label: string;
  visible: boolean;
  enabled: boolean;
}

export function getCliMenuItemState(): CliMenuItemState {
  const { status } = cliInstallState();
  if (status === 'unsupported') return { label: '', visible: false, enabled: false };
  const installed = status === 'installed' || status === 'broken';
  return {
    label: installed
      ? `Remove '${COMMAND_NAME}' Command from PATH`
      : `Install '${COMMAND_NAME}' Command in PATH`,
    visible: true,
    enabled: true,
  };
}

/** The menu item: installs, replaces or removes depending on what is there. */
export async function runCliMenuItemAction(): Promise<void> {
  const { status } = cliInstallState();
  const installed = status === 'installed' || status === 'broken';
  const result = await setCliCommandInstalled(!installed);
  if (result.error !== undefined) {
    await dialog.showMessageBox({
      type: 'error',
      message: installed
        ? 'Could not remove the pigi command'
        : 'Could not install the pigi command',
      detail: result.error,
    });
  }
}

/** The menu is rebuilt when the item's label or visibility changes. */
export function setCliInstallStateObserver(observer: () => void): void {
  stateObserver = observer;
}

export function registerCliInstallHandlers(): void {
  ipcMain.handle(PiChannel.GetCliInstallState, () => cliInstallState());
  ipcMain.handle(
    PiChannel.SetCliInstalled,
    (_event, installed: unknown): Promise<CliInstallResult> => {
      if (typeof installed !== 'boolean')
        return Promise.reject(new Error('installed must be a boolean'));
      return setCliCommandInstalled(installed);
    },
  );
}
