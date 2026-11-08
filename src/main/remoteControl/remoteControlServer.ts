/**
 * The `pigi` CLI's socket (docs/cli.md §3, §8).
 *
 * Main only frames, validates and relays: commands run in the renderer, which
 * owns the UI state, and their answers come back as finished JSON-RPC lines
 * that main writes without parsing. Main answers `system.hello` itself so the
 * handshake works before a window exists.
 */
import { app, ipcMain, type BrowserWindow, type WebContents } from 'electron';
import { chmod, rm } from 'node:fs/promises';
import net from 'node:net';
import { delimiter, join } from 'node:path';
import { userInfo } from 'node:os';
import {
  PiChannel,
  type RemoteCommandOutput,
  type RemoteCommandRequest,
} from '../../shared/ipcContract';
import {
  PIGI_SESSION_ENV,
  PIGI_SOCKET_ENV,
  REMOTE_MAX_LINE_BYTES,
  REMOTE_METHODS,
  REMOTE_PROTOCOL_VERSION,
  type RemoteError,
  type RemoteResults,
  isRemoteMethod,
  parseRemoteParams,
  remoteError,
} from '../../shared/remoteCommandContract';

/** A request waits this long for a renderer (a reopened window loading). */
const RENDERER_READY_TIMEOUT_MS = 30 * 1000;

interface RemoteControlHost {
  getWindow: () => BrowserWindow | null;
  /** macOS keeps running without a window; a request reopens it. */
  openWindow: () => void;
}

interface PendingRequest {
  socket: net.Socket;
  request: RemoteCommandRequest;
}

let host: RemoteControlHost | null = null;
let nextRequestId = 0;
const relayed = new Map<number, PendingRequest>();
/** Requests that arrived before the renderer said it was ready. */
let queued: Array<{ pending: PendingRequest; timer: NodeJS.Timeout }> = [];
let readyContents: WebContents | null = null;
const watchedContents = new WeakSet<WebContents>();

export function remoteControlSocketPath(): string {
  const suffix = app.isPackaged ? '' : '-dev';
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\pigi-${userInfo().username}${suffix}`;
  }
  return join(app.getPath('userData'), `pigi${suffix}.sock`);
}

/** `resources/bin`, where the `pigi` launcher lives (unpacked from the asar). */
function launcherDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin')
    : join(app.getAppPath(), 'resources', 'bin');
}

/** The environment of every session and terminal process (docs/cli.md §5). */
export function remoteControlEnv(): NodeJS.ProcessEnv {
  const path = process.env.PATH ?? '';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [PIGI_SOCKET_ENV]: remoteControlSocketPath(),
    PATH: path ? `${launcherDirectory()}${delimiter}${path}` : launcherDirectory(),
  };
  // A pigi started from a pigi session's bash (the dev workflow) inherits that
  // session's path. A session process sets its own; a terminal must have none.
  delete env[PIGI_SESSION_ENV];
  return env;
}

function encode(
  id: string | number | null,
  body: { result: unknown } | { error: RemoteError },
): string {
  return `${JSON.stringify({ jsonrpc: '2.0', id, ...body })}\n`;
}

function write(socket: net.Socket, line: string): void {
  if (!socket.destroyed) socket.write(line);
}

function hello(): RemoteResults['system.hello'] {
  return {
    protocolVersion: REMOTE_PROTOCOL_VERSION,
    appVersion: app.getVersion(),
    methods: Object.keys(REMOTE_METHODS).filter(isRemoteMethod),
  };
}

function liveWindow(): BrowserWindow | null {
  const window = host?.getWindow() ?? null;
  return window && !window.isDestroyed() ? window : null;
}

function failRelayed(requestId: number, error: RemoteError): void {
  const pending = relayed.get(requestId);
  if (!pending) return;
  relayed.delete(requestId);
  write(pending.socket, encode(pending.request.id, { error }));
}

/** A reload, crash or closed window takes the renderer's half of every request. */
function watchContents(contents: WebContents): void {
  if (watchedContents.has(contents)) return;
  watchedContents.add(contents);
  const reset = (): void => {
    if (readyContents === contents) readyContents = null;
    for (const requestId of [...relayed.keys()]) {
      failRelayed(
        requestId,
        remoteError('WINDOW_RELOADED', 'the pigi window reloaded or closed during the request'),
      );
    }
  };
  contents.on('did-start-loading', reset);
  contents.on('render-process-gone', reset);
  contents.on('destroyed', reset);
}

function relay(pending: PendingRequest): void {
  const contents = readyContents;
  if (!contents || contents.isDestroyed()) {
    enqueue(pending);
    return;
  }
  relayed.set(pending.request.requestId, pending);
  contents.send(PiChannel.RemoteCommand, pending.request);
}

function enqueue(pending: PendingRequest): void {
  const timer = setTimeout(() => {
    queued = queued.filter((entry) => entry.pending !== pending);
    write(
      pending.socket,
      encode(pending.request.id, {
        error: remoteError('APP_NOT_READY', 'the pigi window did not become ready'),
      }),
    );
  }, RENDERER_READY_TIMEOUT_MS);
  queued.push({ pending, timer });
  if (host && !liveWindow()) host.openWindow();
}

function flushQueue(): void {
  const entries = queued;
  queued = [];
  for (const { pending, timer } of entries) {
    clearTimeout(timer);
    if (!pending.socket.destroyed) relay(pending);
  }
}

function handleLine(socket: net.Socket, line: string): void {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    write(socket, encode(null, { error: remoteError('PARSE_ERROR', 'invalid JSON') }));
    return;
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    write(socket, encode(null, { error: remoteError('INVALID_REQUEST', 'expected an object') }));
    return;
  }
  const field = (name: string): unknown => Reflect.get(message, name);
  const [jsonrpc, id, method, params] = ['jsonrpc', 'id', 'method', 'params'].map(field);
  // A notification (no id) asks for no answer; the CLI sends none today.
  if (id === undefined) return;
  if (typeof id !== 'string' && typeof id !== 'number') {
    write(socket, encode(null, { error: remoteError('INVALID_REQUEST', 'invalid id') }));
    return;
  }
  if (jsonrpc !== '2.0' || typeof method !== 'string') {
    write(socket, encode(id, { error: remoteError('INVALID_REQUEST', 'not JSON-RPC 2.0') }));
    return;
  }
  if (!isRemoteMethod(method)) {
    write(
      socket,
      encode(id, { error: remoteError('METHOD_NOT_FOUND', `unknown method ${method}`) }),
    );
    return;
  }
  const parsed = parseRemoteParams(method, params);
  if (!parsed.ok) {
    write(socket, encode(id, { error: parsed.error }));
    return;
  }
  if (method === 'system.hello') {
    write(socket, encode(id, { result: hello() }));
    return;
  }
  relay({
    socket,
    request: { requestId: ++nextRequestId, id, method, params: parsed.params },
  });
}

function handleConnection(socket: net.Socket): void {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > REMOTE_MAX_LINE_BYTES) {
        socket.destroy();
        return;
      }
      if (line) handleLine(socket, line);
      newline = buffer.indexOf('\n');
    }
    if (Buffer.byteLength(buffer) > REMOTE_MAX_LINE_BYTES) {
      socket.destroy();
    }
  });
  socket.on('error', () => socket.destroy());
  socket.on('close', () => {
    for (const [requestId, pending] of relayed) {
      if (pending.socket !== socket) continue;
      relayed.delete(requestId);
      readyContents?.send(PiChannel.RemoteCommandCancel, { requestId });
    }
    queued = queued.filter((entry) => {
      if (entry.pending.socket !== socket) return true;
      clearTimeout(entry.timer);
      return false;
    });
  });
}

function registerRendererIpc(): void {
  ipcMain.on(PiChannel.RemoteControlReady, (event) => {
    // Only the main window runs commands; the update window shares the preload.
    if (event.sender !== liveWindow()?.webContents) return;
    readyContents = event.sender;
    watchContents(event.sender);
    flushQueue();
  });
  ipcMain.on(PiChannel.RemoteCommandOutput, (event, output: RemoteCommandOutput) => {
    if (event.sender !== readyContents) return;
    const pending = relayed.get(output?.requestId);
    if (!pending || typeof output.line !== 'string') return;
    if (output.final) relayed.delete(output.requestId);
    // Written as the renderer serialized it: main never parses a result.
    write(pending.socket, `${output.line}\n`);
  });
}

/**
 * `EADDRINUSE` means a socket file exists. A refused connection means it is
 * stale, so it is replaced; an accepted one means another instance serves it.
 */
function listen(server: net.Server, path: string): void {
  let replacedStale = false;
  // Kept for the server's life: an error with no listener would crash main.
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE' || replacedStale || process.platform === 'win32') {
      console.error('[remoteControl] cannot listen:', error.message);
      return;
    }
    const probe = net.createConnection(path);
    probe.once('connect', () => {
      probe.destroy();
      console.error(`[remoteControl] ${path} is served by another pigi instance`);
    });
    probe.once('error', () => {
      replacedStale = true;
      rm(path, { force: true }).then(
        () => server.listen(path),
        (removeError: unknown) =>
          console.error('[remoteControl] cannot replace', path, removeError),
      );
    });
  });
  server.listen(path);
}

export function startRemoteControlServer(nextHost: RemoteControlHost): void {
  host = nextHost;
  registerRendererIpc();
  const path = remoteControlSocketPath();
  const server = net.createServer(handleConnection);
  // userData is per user already; the mode keeps the socket private if it
  // ever is not.
  server.on('listening', () => {
    if (process.platform !== 'win32') {
      chmod(path, 0o600).catch((error) => console.error('[remoteControl] chmod failed:', error));
    }
  });
  // sockaddr_un holds 104 bytes on macOS (108 on Linux), terminator included.
  if (process.platform !== 'win32' && Buffer.byteLength(path) > 103) {
    console.error(`[remoteControl] socket path too long: ${path}`);
    return;
  }
  listen(server, path);
  app.on('will-quit', () => {
    server.close();
  });
}
