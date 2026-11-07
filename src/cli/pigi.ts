/**
 * The `pigi` command (docs/cli.md). Runs under Electron in Node mode, started
 * by `resources/bin/pigi`; talks JSON-RPC to the running app over its socket.
 *
 * stdout carries only the result an agent reads; progress goes to stderr.
 */
import net from 'node:net';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import {
  PIGI_SOCKET_ENV,
  REMOTE_METHODS,
  REMOTE_PROTOCOL_VERSION,
  SUBAGENT_STARTED_NOTIFICATION,
  remoteError,
  type RemoteError,
  type RemoteMethod,
  type RemoteResults,
  type RemoteSessionCreated,
} from '../shared/remoteCommandContract';
import { parseCliArguments, type CliParams } from './cliArguments';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_NOT_RUNNING = 3;

const TITLE_COLUMN_LENGTH = 80;

const USAGE_ERRORS = new Set(['INVALID_PARAMS', 'UNSUPPORTED_PARAM', 'METHOD_NOT_FOUND']);

class ConnectionError extends Error {}

/** The production app's socket, for terminals outside pigi. */
function defaultSocketPath(): string {
  if (process.platform === 'win32') return `\\\\.\\pipe\\pigi-${userInfo().username}`;
  const userData =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'pigi')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'pigi');
  return join(userData, 'pigi.sock');
}

type Answer<M extends RemoteMethod> = { result: RemoteResults[M] } | { error: RemoteError };

interface Envelope {
  id?: unknown;
  method?: unknown;
}

class RemoteClient {
  private nextId = 0;
  private buffer = '';
  /** Settled with the raw line, parsed where its method's type is known. */
  private readonly waiting = new Map<number, (line: string) => void>();
  private onNotification: (method: string, line: string) => void = () => {};

  private constructor(private readonly socket: net.Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.receive(chunk));
    socket.on('close', () => {
      // Exit 1, not 3: the request may have half run (a child created), so
      // retrying it after starting pigi is not safe the way a refused connect is.
      const closed = JSON.stringify({
        error: remoteError('APP_NOT_READY', 'pigi closed the connection'),
      });
      for (const settle of this.waiting.values()) settle(closed);
      this.waiting.clear();
    });
  }

  static connect(path: string): Promise<RemoteClient> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(path);
      socket.once('connect', () => resolve(new RemoteClient(socket)));
      socket.once('error', (error) =>
        reject(new ConnectionError(`pigi is not running (${path}: ${error.message})`)),
      );
    });
  }

  listen(handler: (method: string, line: string) => void): void {
    this.onNotification = handler;
  }

  call<M extends RemoteMethod>(method: M, params: CliParams): Promise<Answer<M>> {
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.waiting.set(id, (line) => resolve(JSON.parse(line)));
      this.socket.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  close(): void {
    this.socket.end();
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.dispatch(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private dispatch(line: string): void {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof envelope.id !== 'number') {
      // Unknown notifications are ignored: a newer app may send more.
      if (envelope.id == null && typeof envelope.method === 'string') {
        this.onNotification(envelope.method, line);
      }
      return;
    }
    const settle = this.waiting.get(envelope.id);
    if (!settle) return;
    this.waiting.delete(envelope.id);
    settle(line);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => (text += chunk));
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  });
}

function out(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

function note(text: string): void {
  process.stderr.write(`pigi: ${text}\n`);
}

function describeCreated(created: RemoteSessionCreated): string {
  const { requested, effective } = created.thinkingLevel;
  const thinking =
    requested && effective && requested !== effective
      ? `thinking ${effective} (${requested} is not supported)`
      : `thinking ${effective ?? 'off'}`;
  return `${created.path} (${created.model ?? 'default model'}, ${thinking})`;
}

const PRINTERS: { [M in RemoteMethod]: (result: RemoteResults[M]) => void } = {
  'system.hello': (hello) => out(`pigi ${hello.appVersion} (protocol ${hello.protocolVersion})`),
  'session.list': ({ sessions }) => {
    for (const session of sessions) {
      const marks = [session.running && 'running', session.isSubagent && 'subagent']
        .filter(Boolean)
        .join(', ');
      const title = session.title.replace(/\s+/g, ' ').slice(0, TITLE_COLUMN_LENGTH);
      out(`${session.path}\t${title}${marks ? `\t[${marks}]` : ''}`);
    }
  },
  'session.create': (created) => {
    note(`created ${describeCreated(created)}`);
    out(created.path);
  },
  'session.prompt': () => {},
  'session.wait': ({ reply }) => out(reply),
  'subagent.run': (result) => out(result.reply ?? result.path),
};

/** Human output; `--json` prints the result as it came instead. */
function printResult<M extends RemoteMethod>(
  method: M,
  result: RemoteResults[M],
  json: boolean,
): void {
  if (json) {
    out(JSON.stringify(result, null, 2));
    return;
  }
  const printer: (result: RemoteResults[M]) => void = PRINTERS[method];
  printer(result);
}

async function run(argv: string[]): Promise<number> {
  const invocation = parseCliArguments(argv, { cwd: process.cwd(), env: process.env });
  if (invocation.kind === 'help') {
    out(invocation.text);
    return EXIT_OK;
  }
  if (invocation.kind === 'usage_error') {
    note(invocation.message);
    return EXIT_USAGE;
  }
  const { method, params, json, stdinParam } = invocation;
  if (stdinParam) params[stdinParam] = await readStdin();

  const client = await RemoteClient.connect(process.env[PIGI_SOCKET_ENV] || defaultSocketPath());
  try {
    const hello = await client.call('system.hello', {});
    if ('error' in hello) throw new ConnectionError(hello.error.message);
    const info = hello.result;
    if (info.protocolVersion !== REMOTE_PROTOCOL_VERSION) {
      throw new ConnectionError(
        `pigi ${info.appVersion} speaks protocol ${info.protocolVersion}, this CLI ${REMOTE_PROTOCOL_VERSION}; restart pigi`,
      );
    }
    if (!info.methods.includes(method)) {
      throw new ConnectionError(
        `pigi ${info.appVersion} has no "${REMOTE_METHODS[method].command}"; restart pigi to run the updated version`,
      );
    }
    if (method === 'system.hello') {
      printResult('system.hello', info, json);
      return EXIT_OK;
    }

    client.listen((notification, line) => {
      if (notification !== SUBAGENT_STARTED_NOTIFICATION || json) return;
      const started: { params: RemoteSessionCreated } = JSON.parse(line);
      note(`subagent ${describeCreated(started.params)}`);
    });
    const answer = await client.call(method, params);
    if ('error' in answer) {
      const { error } = answer;
      if (json) out(JSON.stringify({ error }, null, 2));
      else {
        if (error.data?.reply) out(error.data.reply);
        note(error.message);
      }
      return USAGE_ERRORS.has(error.data?.code) ? EXIT_USAGE : EXIT_FAILED;
    }
    printResult(method, answer.result, json);
    return EXIT_OK;
  } finally {
    client.close();
  }
}

// `pigi session list | head` closes stdout early; that is not an error.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(EXIT_OK);
  throw error;
});

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    note(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof ConnectionError ? EXIT_NOT_RUNNING : EXIT_FAILED;
  },
);
