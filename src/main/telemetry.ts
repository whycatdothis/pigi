/**
 * Usage telemetry under a random install id, sent from the main process only to pigi's own endpoint
 * (`website/functions/api/telemetry.ts`). What is sent and why: docs/telemetry.md.
 *
 * Nothing is sent unless all three hold: the build carries the endpoint (only
 * the release workflow injects one, so dev and fork builds send nothing), the
 * Settings switch is on, and `DO_NOT_TRACK` is unset or `0`.
 */
import { app, ipcMain, net } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PiChannel } from '../shared/ipcContract';
import { DO_NOT_TRACK_ENV } from './processes/shellEnvResolver';

declare const __PIGI_TELEMETRY_URL__: string;

const INSTALL_ID_FILE_NAME = 'telemetry-id';
// The endpoint rejects anything else, so a damaged file would end telemetry for good.
const INSTALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A burst goes out as one request: the endpoint's plan counts requests. What is
// still queued when the app quits may be lost.
const FLUSH_DELAY_MS = 30_000;
// The endpoint takes at most this many per request.
const MAX_EVENTS_PER_REQUEST = 100;
// Kept while offline; past this, new events are dropped, so `app_started` and
// the first errors survive a held-down shortcut.
const MAX_QUEUED_EVENTS = 500;
// An error thrown on every frame must not become a stream of reports.
const MAX_ERRORS_PER_LAUNCH = 20;
const MAX_MESSAGE_LENGTH = 300;
const MAX_STACK_LENGTH = 2000;
const FEATURE_PATTERN = /^(tab|shortcut)\.[\w.]{1,48}$/;

export type ErrorSource = 'main' | 'renderer' | 'update';

/** `fields` are stored by position (blob6, blob7, …); the table is in docs/telemetry.md. */
interface ErrorReport {
  name: string;
  message: string;
  stack?: string;
}

interface TelemetryEvent {
  name: 'app_started' | 'prompt_sent' | 'feature_used' | 'exception' | 'process_gone';
  fields?: string[];
  value?: number;
}

let installId: string | null = null;
let queue: TelemetryEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;
const reportedErrors = new Set<string>();

function installIdPath(): string {
  return join(app.getPath('userData'), INSTALL_ID_FILE_NAME);
}

function readOrCreateInstallId(): string | null {
  const path = installIdPath();
  try {
    const stored = readFileSync(path, 'utf8').trim();
    if (INSTALL_ID_PATTERN.test(stored)) return stored;
  } catch {
    // No id yet.
  }
  try {
    const id = randomUUID();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, id, 'utf8');
    return id;
  } catch {
    // Telemetry must never stop the app: without an id it stays off this launch.
    return null;
  }
}

/**
 * Error text names files, hosts and accounts, and a path names its owner and
 * their projects. App frames keep their place in the bundle
 * (`<app>/out/main/index.js:12:3`); everything else that looks like a path, URL,
 * address, host name or key is replaced whole. Losing a harmless `a/b` or
 * `x.map` with it is the price of not guessing.
 */
export function scrubErrorText(text: string, appPath: string): string {
  return (
    text
      .replaceAll(pathToFileURL(appPath).href, '<app>')
      .replaceAll(appPath, '<app>')
      .replace(/\b[a-z][\w+.-]*:\/\/[^\s'"`()<>]+/gi, '<url>')
      // pi's dash-encoded session folders: `--Users-ann-My Projects-acme--`.
      .replace(/--[a-z][^\n/'"`]*?--(?![\w-])/gi, '<path>')
      // A quoted path ends at its quote, so it may hold spaces.
      .replace(/(['"`])(?:~|\.{0,2}\/|[a-z]:[\\/]|\\\\)[^'"`\n]*\1/gi, '$1<path>$1')
      // An unquoted absolute path has no known end ("My Drive"): it runs to the
      // next delimiter, spaces and all.
      .replace(/(^|[\s(=,[:])(?:~[\\/]|\/|[a-z]:[\\/]|\\\\)[^'"`()<>[\],;\n]*/gim, '$1<path>')
      // Any other token with a slash: relative paths, `provider/model`, `user/repo`.
      .replace(/(^|[\s'"`(=,[:])(?!<)[^\s'"`()<>[\],]*[\\/][^\s'"`()<>[\],]*/gm, '$1<path>')
      .replace(/[^\s'"`()<>[\],]+@[^\s'"`()<>[\],]+/g, '<email>')
      .replace(/(?<![\w/.<>-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\w.-])/gi, '<host>')
      // Keys and ids: long runs with a digit in them.
      .replace(/\b(?=[\w-]*\d)[\w-]{20,}/g, '<token>')
  );
}

function enqueue(event: TelemetryEvent): void {
  if (!installId) return;
  if (queue.length >= MAX_QUEUED_EVENTS) return;
  queue.push(event);
  flushTimer ??= setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!installId || queue.length === 0) return;
  const events = queue.splice(0, MAX_EVENTS_PER_REQUEST);
  let delivered = false;
  try {
    const response = await net.fetch(__PIGI_TELEMETRY_URL__, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installId,
        appVersion: app.getVersion(),
        osVersion: process.getSystemVersion(),
        arch: process.arch,
        events,
      }),
    });
    delivered = response.status < 500 && response.status !== 429;
  } catch {
    // Offline.
  }
  // Offline or the endpoint is down: kept for the next try. A batch it rejects
  // (4xx) would be rejected again, so it is dropped.
  if (!delivered && installId) queue = [...events, ...queue].slice(0, MAX_QUEUED_EVENTS);
  if (queue.length > 0) flushTimer ??= setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

export function captureError(error: ErrorReport, source: ErrorSource): void {
  if (!installId || reportedErrors.size >= MAX_ERRORS_PER_LAUNCH) return;
  const appPath = app.getAppPath();
  // Cut before scrubbing so a huge message is not scanned whole; a path cut in
  // half is still a path to the scrubber.
  const message = scrubErrorText(error.message.slice(0, MAX_MESSAGE_LENGTH * 4), appPath);
  // Keyed after scrubbing: the same error on twenty files is one report.
  const key = `${source}|${error.name}|${message}`;
  if (reportedErrors.has(key)) return;
  reportedErrors.add(key);
  const stack = scrubErrorText((error.stack ?? '').slice(0, MAX_STACK_LENGTH * 4), appPath);
  enqueue({
    name: 'exception',
    fields: [
      source,
      error.name.slice(0, 64),
      message.slice(0, MAX_MESSAGE_LENGTH),
      stack.slice(0, MAX_STACK_LENGTH),
    ],
  });
}

function doNotTrack(): boolean {
  const value = process.env[DO_NOT_TRACK_ENV];
  return value !== undefined && value !== '' && value !== '0';
}

/** Follows the Settings switch; turning it off also forgets the install id. */
export function setTelemetryEnabled(enabled: boolean): void {
  if (enabled && __PIGI_TELEMETRY_URL__ !== '' && !doNotTrack()) {
    installId ??= readOrCreateInstallId();
    return;
  }
  installId = null;
  queue = [];
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (enabled) return;
  try {
    rmSync(installIdPath(), { force: true });
  } catch {
    // Left in place; nothing is sent while the switch is off.
  }
}

/** Call once, after the shell env is resolved (it may carry `DO_NOT_TRACK`). */
export function initializeTelemetry(options: { enabled: boolean; toolView: string }): void {
  setTelemetryEnabled(options.enabled);
  enqueue({ name: 'app_started', fields: [options.toolView] });

  // A monitor, not a handler: a handler would change what Electron does with an
  // uncaught exception.
  process.on('uncaughtExceptionMonitor', (error) => captureError(error, 'main'));
  // Listening silences Node's own warning, so print it here.
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection in main:', reason);
    if (reason instanceof Error) captureError(reason, 'main');
  });

  // `killed` stays: pigi's own `kill()` exits cleanly, so a kill is the OS or the user.
  app.on('render-process-gone', (_event, _contents, details) => {
    if (details.reason === 'clean-exit') return;
    enqueue({
      name: 'process_gone',
      fields: ['renderer', details.reason],
      value: details.exitCode,
    });
  });
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    enqueue({
      name: 'process_gone',
      fields: [details.name ?? details.type, details.reason],
      value: details.exitCode,
    });
  });

  // Best effort: holding the quit for a request would get in the way of an
  // update's quit-and-install.
  app.on('before-quit', () => void flush());

  ipcMain.on(PiChannel.ReportTelemetry, (_event, report: unknown) => {
    if (typeof report !== 'object' || report === null || !('type' in report)) return;
    if (report.type === 'prompt_sent') {
      enqueue({ name: 'prompt_sent' });
    } else if (report.type === 'feature_used') {
      const feature = 'feature' in report ? report.feature : undefined;
      if (typeof feature === 'string' && FEATURE_PATTERN.test(feature)) {
        enqueue({ name: 'feature_used', fields: [feature] });
      }
    } else if (report.type === 'exception') {
      const name = 'name' in report ? report.name : undefined;
      const message = 'message' in report ? report.message : undefined;
      const stack = 'stack' in report ? report.stack : undefined;
      if (typeof name === 'string' && typeof message === 'string') {
        captureError(
          { name, message, stack: typeof stack === 'string' ? stack : undefined },
          'renderer',
        );
      }
    }
  });
}
