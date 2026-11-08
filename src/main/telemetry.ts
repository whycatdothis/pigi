/**
 * Anonymous telemetry, sent from the main process only to pigi's own endpoint
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

declare const __PIGI_TELEMETRY_URL__: string;

const INSTALL_ID_FILE_NAME = 'telemetry-id';
// A burst goes out as one request: the endpoint's plan counts requests. What is
// still queued when the app quits may be lost.
const FLUSH_DELAY_MS = 30_000;
// The endpoint takes at most this many per request.
const MAX_EVENTS_PER_REQUEST = 100;
// Kept while offline; the oldest go first.
const MAX_QUEUED_EVENTS = 500;
// An error thrown on every frame must not become a stream of reports.
const MAX_ERRORS_PER_LAUNCH = 20;
const MAX_MESSAGE_LENGTH = 300;
const MAX_STACK_LENGTH = 2000;
const FEATURE_PATTERN = /^(tab|shortcut)\.[\w.]{1,48}$/;

export type ErrorSource = 'main' | 'renderer' | 'update';

/** `fields` are stored by position (blob6, blob7, …); the table is in docs/telemetry.md. */
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
    if (stored) return stored;
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
 * Error text names files, and a path names its owner and their projects. App
 * frames keep their place in the bundle (`<app>/out/main/index.js:12:3`); any
 * other path or URL is replaced whole.
 */
export function scrubErrorText(text: string, appPath: string): string {
  return text
    .replaceAll(pathToFileURL(appPath).href, '<app>')
    .replaceAll(appPath, '<app>')
    .replace(/\b[a-z][\w+.-]*:\/\/[^\s'"`()<>]+/gi, '<url>')
    .replace(/(^|[\s'"`(=,[])(?:~|\/)[^\s'"`()\],]+/gm, '$1<path>')
    .replace(/--[^\s/]+--/g, '<path>');
}

function enqueue(event: TelemetryEvent): void {
  if (!installId) return;
  queue.push(event);
  if (queue.length > MAX_QUEUED_EVENTS) queue.shift();
  flushTimer ??= setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!installId || queue.length === 0) return;
  const events = queue.splice(0, MAX_EVENTS_PER_REQUEST);
  try {
    await net.fetch(__PIGI_TELEMETRY_URL__, {
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
  } catch {
    // Offline: keep them for the next try. A rejected request is not retried.
    if (!installId) return;
    queue = [...events, ...queue].slice(-MAX_QUEUED_EVENTS);
  }
  if (queue.length > 0) flushTimer ??= setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

export function captureError(error: unknown, source: ErrorSource): void {
  if (!installId || !(error instanceof Error)) return;
  const key = `${source}|${error.name}|${error.message}`;
  if (reportedErrors.has(key) || reportedErrors.size >= MAX_ERRORS_PER_LAUNCH) return;
  reportedErrors.add(key);
  const appPath = app.getAppPath();
  // Cut before scrubbing so a huge message is not scanned whole; a path cut in
  // half is still a path to the scrubber.
  const message = scrubErrorText(error.message.slice(0, MAX_MESSAGE_LENGTH * 4), appPath);
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
  const value = process.env['DO_NOT_TRACK'];
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

function parseRendererError(report: Record<string, unknown>): Error | null {
  if (typeof report.name !== 'string' || typeof report.message !== 'string') return null;
  const error = new Error(report.message);
  error.name = report.name;
  error.stack = typeof report.stack === 'string' ? report.stack : undefined;
  return error;
}

/** Call once, after the shell env is resolved (it may carry `DO_NOT_TRACK`). */
export function initializeTelemetry(options: { enabled: boolean; toolView: string }): void {
  setTelemetryEnabled(options.enabled);
  enqueue({ name: 'app_started', fields: [options.toolView] });

  // Monitors only: a handler for uncaught exceptions would change what Electron
  // does with them. Rejections in main only print a warning, listened or not.
  process.on('uncaughtExceptionMonitor', (error) => captureError(error, 'main'));
  process.on('unhandledRejection', (reason) => captureError(reason, 'main'));

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

  app.on('before-quit', () => void flush());

  ipcMain.on(PiChannel.ReportTelemetry, (_event, report: unknown) => {
    if (typeof report !== 'object' || report === null || !('type' in report)) return;
    if (report.type === 'prompt_sent') {
      enqueue({ name: 'prompt_sent' });
    } else if (report.type === 'feature') {
      const feature = 'feature' in report ? report.feature : undefined;
      if (typeof feature === 'string' && FEATURE_PATTERN.test(feature)) {
        enqueue({ name: 'feature_used', fields: [feature] });
      }
    } else if (report.type === 'error') {
      captureError(parseRendererError({ ...report }), 'renderer');
    }
  });
}
