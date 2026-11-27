import { spawn, type ChildProcess } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CancellationTokenSource,
  createProtocolConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  InitializedNotification,
  InitializeRequest,
  type Location,
  type LocationLink,
  type ProtocolConnection,
} from 'vscode-languageserver-protocol/node';
import { TYPESCRIPT_SERVER_DIRECTORY_ENV, type CodeLanguage } from '../../../shared/codeNavigation';
import { LANGUAGE_SERVERS, languageIdFor, type ServerCommand } from './languages';

/** A server that has not answered `initialize` in this long is stuck. */
const INITIALIZE_TIMEOUT_MS = 60_000;
/** A started server that runs out of budget this many lookups in a row is given up on. */
const MAX_SLOW_ANSWERS = 3;
const FILE_URI_PREFIX = 'file:';
const WINDOWS_SCRIPT_EXTENSION = '.cmd';
const ELECTRON_RUN_AS_NODE_ENV = 'ELECTRON_RUN_AS_NODE';

/** Places servers are installed without being put on PATH. */
function extraBinDirectories(): string[] {
  const goPaths = (process.env['GOPATH'] || join(homedir(), 'go')).split(delimiter);
  return [
    // Neovim's Mason.
    join(homedir(), '.local', 'share', 'nvim', 'mason', 'bin'),
    // `go install`, where the Go extensions of editors put gopls.
    process.env['GOBIN'] ?? '',
    ...goPaths.map((goPath) => join(goPath, 'bin')),
  ];
}

interface ServerLaunch {
  executable: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  initializationOptions?: object;
}

export interface ServerLocation {
  /** Absolute. */
  path: string;
  /** 1-based. */
  line: number;
}

function findExecutable(command: string): string | null {
  const directories = [...(process.env['PATH'] ?? '').split(delimiter), ...extraBinDirectories()];
  const names =
    process.platform === 'win32'
      ? [`${command}.exe`, `${command}${WINDOWS_SCRIPT_EXTENSION}`]
      : [command];
  for (const directory of directories) {
    // A relative entry would resolve against the server's cwd: the repository.
    if (!isAbsolute(directory)) continue;
    for (const name of names) {
      const candidate = join(directory, name);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return null;
}

function serverLaunch(server: ServerCommand): ServerLaunch | null {
  if ('command' in server) {
    const executable = findExecutable(server.command);
    return executable ? { executable, args: [...server.args] } : null;
  }
  const directory = process.env[TYPESCRIPT_SERVER_DIRECTORY_ENV];
  if (!directory) return null;
  const cli = join(directory, 'typescript-language-server', 'lib', 'cli.mjs');
  const typescript = join(directory, 'typescript-for-navigation');
  const tsserver = join(typescript, 'lib', 'tsserver.js');
  // typescript-language-server ignores a tsserver path it finds incomplete and
  // runs the project's own TypeScript instead: repository code.
  if (![cli, tsserver, join(typescript, 'package.json')].every((path) => existsSync(path))) {
    return null;
  }
  return {
    executable: process.execPath,
    args: [cli, '--stdio'],
    env: { ...process.env, [ELECTRON_RUN_AS_NODE_ENV]: '1' },
    initializationOptions: {
      // A tsserver outside the project loads no plugins from it.
      tsserver: {
        path: tsserver,
        // The syntax server answers while the project loads, knowing only the
        // open file: a jump lands on the import line instead of the definition.
        useSyntaxServer: 'never',
      },
      // Otherwise tsserver runs npm in the background to fetch @types packages.
      disableAutomaticTypingAcquisition: true,
    },
  };
}

function toServerLocations(
  result: Location | Location[] | LocationLink[] | null,
): ServerLocation[] {
  if (!result) return [];
  const items: (Location | LocationLink)[] = Array.isArray(result) ? result : [result];
  const locations: ServerLocation[] = [];
  for (const item of items) {
    const [uri, range] =
      'targetUri' in item ? [item.targetUri, item.targetSelectionRange] : [item.uri, item.range];
    if (!uri.startsWith(FILE_URI_PREFIX)) continue;
    locations.push({ path: fileURLToPath(uri), line: range.start.line + 1 });
  }
  return locations;
}

class LanguageServer {
  readonly ready: Promise<void>;
  private readonly child: ChildProcess;
  private readonly connection: ProtocolConnection;
  private started = false;
  private slowAnswers = 0;
  private openDocument: { uri: string; version: number } | null = null;
  /** `onClose` runs when the server exits, which only a failure makes it do before pigi quits. */
  constructor(launch: ServerLaunch, root: string, onClose: () => void) {
    const { executable, args, env } = launch;
    // Node refuses to run a .cmd without a shell, which then needs the quoting.
    const shell = executable.endsWith(WINDOWS_SCRIPT_EXTENSION);
    const quote = (value: string): string => (shell ? `"${value}"` : value);
    this.child = spawn(quote(executable), args.map(quote), {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell,
    });
    // An unread pipe fills up and blocks the server's next write.
    this.child.stderr?.resume();
    if (!this.child.stdout || !this.child.stdin) throw new Error('No stdio pipes');
    this.connection = createProtocolConnection(this.child.stdout, this.child.stdin);
    this.connection.listen();

    const exited = new Promise<never>((_resolve, reject) => {
      const fail = (reason: string): void => {
        onClose();
        this.connection.dispose();
        reject(new Error(reason));
      };
      this.child.once('error', (error) => fail(error.message));
      this.child.once('exit', (code) => fail(`exited with code ${code}`));
    });
    exited.catch(() => {});
    this.ready = Promise.race([
      this.initialize(root, launch.initializationOptions),
      exited,
      rejectAfter(INITIALIZE_TIMEOUT_MS),
    ]);
    this.ready.then(
      () => {
        this.started = true;
      },
      () => this.kill(),
    );
  }

  private async initialize(root: string, initializationOptions?: object): Promise<void> {
    const rootUri = pathToFileURL(root).href;
    await this.connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      clientInfo: { name: 'pigi' },
      initializationOptions,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: basename(root) }],
      capabilities: {
        general: { positionEncodings: ['utf-16'] },
        textDocument: { definition: { linkSupport: true } },
        workspace: { workspaceFolders: true },
      },
    });
    await this.connection.sendNotification(InitializedNotification.type, {});
  }

  async definition(
    path: string,
    languageId: string,
    text: string,
    position: { line: number; character: number },
    cancellation: CancellationTokenSource,
  ): Promise<ServerLocation[]> {
    await this.ready;
    if (cancellation.token.isCancellationRequested) return [];
    const uri = pathToFileURL(path).href;
    await this.syncDocument(uri, languageId, text);
    const result = await this.connection.sendRequest(
      DefinitionRequest.type,
      { textDocument: { uri }, position },
      cancellation.token,
    );
    return toServerLocations(result);
  }

  /**
   * Only the last looked-up file stays open, with its current disk content:
   * an open document is an overlay the server trusts over the disk, which the
   * agent keeps changing. Closing every file after its lookup would be safer
   * still, but typescript-language-server then unloads the project and
   * answers the next lookup before reloading it, with the import line instead
   * of the definition.
   */
  private async syncDocument(uri: string, languageId: string, text: string): Promise<void> {
    const previous = this.openDocument;
    if (previous?.uri === uri) {
      previous.version += 1;
      await this.connection.sendNotification(DidChangeTextDocumentNotification.type, {
        textDocument: { uri, version: previous.version },
        contentChanges: [{ text }],
      });
      return;
    }
    this.openDocument = { uri, version: 1 };
    await this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId, version: 1, text },
    });
    if (previous) {
      await this.connection.sendNotification(DidCloseTextDocumentNotification.type, {
        textDocument: { uri: previous.uri },
      });
    }
  }

  /** Startup may take any number of lookups; a started server that keeps timing out is stuck. */
  recordAnswer(answered: boolean): void {
    if (!this.started) return;
    this.slowAnswers = answered ? 0 : this.slowAnswers + 1;
    if (this.slowAnswers >= MAX_SLOW_ANSWERS) this.kill();
  }

  kill(): void {
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
  }
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms).unref();
  });
}

const servers = new Map<string, LanguageServer>();
/**
 * Not retried until the process restarts (it exits when idle), so a broken
 * server costs one slow lookup, not every one.
 */
const failedServers = new Set<string>();

function getServer(language: CodeLanguage, root: string): LanguageServer | null {
  for (const server of LANGUAGE_SERVERS[language]?.servers ?? []) {
    const launch = serverLaunch(server);
    if (!launch) continue;
    const key = `${launch.executable}\0${launch.args[0] ?? ''}\0${root}`;
    if (failedServers.has(key)) continue;
    let running = servers.get(key);
    if (!running) {
      const onClose = (): void => {
        servers.delete(key);
        failedServers.add(key);
      };
      try {
        running = new LanguageServer(launch, root, onClose);
      } catch {
        failedServers.add(key);
        return null;
      }
      servers.set(key, running);
    }
    return running;
  }
  return null;
}

/**
 * Definitions from an installed language server, or null when there is none,
 * it fails, or it does not answer within the budget. The server keeps
 * starting after a timeout, so the next lookup can use it.
 */
export async function serverDefinitions(
  root: string,
  path: string,
  language: CodeLanguage,
  text: string,
  position: { line: number; character: number },
  budgetMs: number,
): Promise<ServerLocation[] | null> {
  const languageId = languageIdFor(language, path);
  const server = languageId ? getServer(language, root) : null;
  if (!server || !languageId) return null;
  const cancellation = new CancellationTokenSource();
  const timer = setTimeout(() => cancellation.cancel(), budgetMs);
  try {
    const answer = server.definition(path, languageId, text, position, cancellation);
    // Settles after a timeout too, when nobody is listening.
    answer.catch(() => {});
    const cancelled = new Promise<null>((resolve) => {
      cancellation.token.onCancellationRequested(() => resolve(null));
    });
    const result = await Promise.race([answer, cancelled]);
    server.recordAnswer(result !== null);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    cancellation.dispose();
  }
}

export function stopLanguageServers(): void {
  for (const server of servers.values()) server.kill();
  servers.clear();
}
