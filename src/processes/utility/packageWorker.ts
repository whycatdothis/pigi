/**
 * One package request per process: main forks this with piped stdio, posts a
 * single command, reads the reply and kills the process.
 *
 * Its own process because pi's package manager runs npm and git with inherited
 * stdio, so their output (the only place a 404 or an auth failure is spelled
 * out) reaches main only through this process's pipes; and because checking
 * extensions means running their code, which may leave timers or children
 * behind that a long-lived worker would accumulate.
 */
import {
  CONFIG_DIR_NAME,
  DefaultPackageManager,
  discoverAndLoadExtensions,
  getAgentDir,
  parseFrontmatter,
  type ResolvedPaths,
  type ResolvedResource,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import type { PackageWorkerCommand, PackageWorkerResponse } from '../../shared/ipcContract';
import {
  authorFromManifest,
  npmNameFromSource,
  PI_RESOURCE_KINDS,
  type InstalledPiPackage,
  type PiExtensionLoadError,
  type PiPackageOperation,
  type PiPackageOperationResult,
  type PiPackageScope,
  type PiPackagesHealth,
  type PiPackagesSnapshot,
  type PiResource,
  type PiResourceKind,
  repositoryUrlFromManifest,
} from '../../shared/piPackages';
import { resolveProjectTrust } from './projectTrust';

/** Not created anywhere: extension discovery under it finds nothing. */
const NO_SUCH_DIRECTORY = '.pigi-no-extensions';

/** Extension factories run arbitrary code; one that never settles must not hang the page. */
const EXTENSION_LOAD_TIMEOUT_MS = 20_000;

/** pi's own `npm view` for updates waits as long. */
const RELEASE_DATE_TIMEOUT_MS = 15_000;

interface PackageContext {
  agentDir: string;
  /** The project, or agentDir: it has no `.pi/`, so project scope is empty by construction. */
  cwd: string;
  projectTrusted: boolean | null;
  settingsManager: SettingsManager;
  packageManager: DefaultPackageManager;
}

function createContext(projectCwd: string | null): PackageContext {
  const agentDir = getAgentDir();
  const cwd = projectCwd ?? agentDir;
  const projectTrusted = projectCwd ? resolveProjectTrust(projectCwd, agentDir) : null;
  const settingsManager = SettingsManager.create(cwd, agentDir, {
    projectTrusted: projectTrusted ?? false,
  });
  const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
  return { agentDir, cwd, projectTrusted, settingsManager, packageManager };
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readFrontmatter(path: string): { name?: string; description?: string } {
  try {
    const { frontmatter } = parseFrontmatter(readFileSync(path, 'utf8'));
    return {
      name: stringField(frontmatter, 'name') ?? undefined,
      description: stringField(frontmatter, 'description') ?? undefined,
    };
  } catch {
    return {};
  }
}

function withoutExtension(path: string): string {
  return basename(path, extname(path));
}

function toResource(kind: PiResourceKind, resource: ResolvedResource): PiResource {
  const { path, enabled, metadata } = resource;
  const scope: PiPackageScope = metadata.scope === 'project' ? 'project' : 'user';
  const base = { path, enabled, scope };
  switch (kind) {
    case 'extensions': {
      const file = basename(path);
      // `extensions/foo/index.ts` is the foo extension.
      const name = /^index\.[cm]?[jt]s$/.test(file)
        ? basename(dirname(path))
        : withoutExtension(path);
      return { ...base, kind, name };
    }
    case 'skills': {
      const { name, description } = readFrontmatter(path);
      const fallbackName =
        basename(path) === 'SKILL.md' ? basename(dirname(path)) : withoutExtension(path);
      return { ...base, kind, name: name ?? fallbackName, description };
    }
    case 'prompts':
      return {
        ...base,
        kind,
        name: withoutExtension(path),
        description: readFrontmatter(path).description,
      };
    case 'themes':
      return { ...base, kind, name: withoutExtension(path) };
  }
}

function resourcesByOwner(resolved: ResolvedPaths): {
  byPackage: Map<string, PiResource[]>;
  local: PiResource[];
} {
  const byPackage = new Map<string, PiResource[]>();
  const local: PiResource[] = [];
  for (const kind of PI_RESOURCE_KINDS) {
    for (const entry of resolved[kind]) {
      const resource = toResource(kind, entry);
      if (entry.metadata.origin !== 'package') {
        local.push(resource);
        continue;
      }
      const key = packageKey(
        entry.metadata.scope === 'project' ? 'project' : 'user',
        entry.metadata.source,
      );
      byPackage.set(key, [...(byPackage.get(key) ?? []), resource]);
    }
  }
  return { byPackage, local };
}

function packageKey(scope: PiPackageScope, source: string): string {
  return `${scope}\u0000${source}`;
}

async function readSnapshot(context: PackageContext): Promise<PiPackagesSnapshot> {
  // `skip`: listing must never install what settings name but the disk lacks.
  const resolved = await context.packageManager.resolve(async () => 'skip');
  const { byPackage, local } = resourcesByOwner(resolved);
  const packages = context.packageManager
    .listConfiguredPackages()
    .map((configured): InstalledPiPackage => {
      const installedPath =
        configured.installedPath && existsSync(configured.installedPath)
          ? configured.installedPath
          : null;
      const manifestPath =
        installedPath && statSync(installedPath).isDirectory()
          ? join(installedPath, 'package.json')
          : null;
      const manifest = manifestPath ? readJson(manifestPath) : null;
      return {
        source: configured.source,
        scope: configured.scope,
        version: stringField(manifest, 'version'),
        description: stringField(manifest, 'description'),
        author: authorFromManifest(manifest),
        installedPath,
        repositoryUrl: repositoryUrlFromManifest(manifest),
        resources: byPackage.get(packageKey(configured.scope, configured.source)) ?? [],
      };
    });
  return { packages, local, projectTrusted: context.projectTrusted };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Load errors of the enabled extensions under `root`, or of all of them. */
async function loadErrors(
  context: PackageContext,
  root: string | null = null,
): Promise<PiExtensionLoadError[]> {
  const resolved = await context.packageManager.resolve(async () => 'skip');
  const inRoot = (path: string): boolean =>
    root === null || path === root || path.startsWith(`${root}${sep}`);
  const paths = resolved.extensions
    .filter((entry) => entry.enabled && inRoot(entry.path))
    .map((entry) => entry.path);
  if (paths.length === 0) return [];
  // Discovery always adds `<cwd>/.pi/extensions` and `<agentDir>/extensions`,
  // trusted or disabled or not; resolve() already listed what pi would load.
  // So cwd is agentDir (it has no `.pi/`) and agentDir a folder that does not
  // exist, leaving only `paths`.
  const result = await withTimeout(
    discoverAndLoadExtensions(paths, context.agentDir, join(context.agentDir, NO_SUCH_DIRECTORY)),
    EXTENSION_LOAD_TIMEOUT_MS,
    'Loading extensions timed out',
  );
  return result.errors
    .filter(({ path }) => inRoot(path))
    .map(({ path, error }) => ({
      path,
      // The loader prefixes every message with this; the page says it already.
      error: error.replace(/^Failed to load extension:\s*/, ''),
    }));
}

function capture(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { cwd, timeout: RELEASE_DATE_TIMEOUT_MS }, (error, stdout) => {
      if (error) reject(error);
      else resolvePromise(stdout.trim());
    });
  });
}

/** When the installed version was published (npm) or committed (git); null for a folder. */
async function releaseDate(
  context: PackageContext,
  source: string,
  installedPath: string,
): Promise<string | null> {
  const name = npmNameFromSource(source);
  if (name) {
    const version = stringField(readJson(join(installedPath, 'package.json')), 'version');
    if (!version) return null;
    // The npm pi itself runs, so a configured registry, proxy or token applies.
    const [command = 'npm', ...args] = context.settingsManager.getNpmCommand() ?? [];
    const times: unknown = JSON.parse(
      await capture(command, [...args, 'view', name, 'time', '--json'], context.cwd),
    );
    const time: unknown =
      typeof times === 'object' && times !== null ? Reflect.get(times, version) : null;
    return typeof time === 'string' ? time : null;
  }
  if (!existsSync(join(installedPath, '.git'))) return null;
  return (await capture('git', ['log', '-1', '--format=%cI'], installedPath)) || null;
}

async function releaseDates(context: PackageContext): Promise<Record<string, string>> {
  const entries = await Promise.all(
    context.packageManager
      .listConfiguredPackages()
      .map(async ({ source, installedPath }): Promise<[string, string] | null> => {
        if (!installedPath || !existsSync(installedPath)) return null;
        const date = await releaseDate(context, source, installedPath).catch(() => null);
        return date ? [source, date] : null;
      }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

async function checkHealth(context: PackageContext): Promise<PiPackagesHealth> {
  const [updates, errors, releasedAt] = await Promise.all([
    context.packageManager.checkForAvailableUpdates().catch(() => []),
    loadErrors(context).catch((error: unknown): PiExtensionLoadError[] => [
      { path: '', error: error instanceof Error ? error.message : String(error) },
    ]),
    releaseDates(context),
  ]);
  return { updates: updates.map((update) => update.source), loadErrors: errors, releasedAt };
}

function expandHome(source: string): string {
  return source === '~' || source.startsWith('~/') ? join(homedir(), source.slice(1)) : source;
}

function isLocalSource(source: string): boolean {
  return !/^(npm|git):|:\/\//.test(source);
}

/**
 * pi matches a local source by resolving the given path against its cwd. A
 * path the user typed (`./x`) is read against the project, since pigi has no
 * shell cwd; a path from settings against the settings file it is stored in.
 */
function localSourceAsInput(
  source: string,
  context: PackageContext,
  from: 'typed' | PiPackageScope,
): string {
  if (!isLocalSource(source)) return source;
  const expanded = expandHome(source);
  if (isAbsolute(expanded)) return expanded;
  if (from === 'typed' && context.projectTrusted === null) {
    throw new Error('A relative path needs an open project; use an absolute path instead');
  }
  const base =
    from === 'typed'
      ? context.cwd
      : from === 'user'
        ? context.agentDir
        : join(context.cwd, CONFIG_DIR_NAME);
  return resolve(base, expanded);
}

/** Runs the operation; resolves the source as pi now knows it, for finding what it installed. */
async function operate(context: PackageContext, operation: PiPackageOperation): Promise<string> {
  const local = operation.scope === 'project';
  if (local && context.projectTrusted !== true) {
    throw new Error(
      context.projectTrusted === null
        ? 'Open a project to install into it'
        : 'This project is not trusted, so pi ignores its packages. Trust it in pi first (/trust).',
    );
  }
  // Install takes what the user typed; remove and update a source as settings store it.
  const source = localSourceAsInput(
    operation.source,
    context,
    operation.action === 'install' ? 'typed' : operation.scope,
  );
  if (operation.action === 'install' && isLocalSource(source) && !existsSync(source)) {
    throw new Error(`No such file or directory: ${source}`);
  }
  switch (operation.action) {
    case 'install':
      await context.packageManager.installAndPersist(source, { local });
      break;
    case 'remove':
      if (!(await context.packageManager.removeAndPersist(source, { local }))) {
        throw new Error(`No installed package matches ${source}`);
      }
      break;
    case 'update':
      await context.packageManager.update(source);
      break;
  }
  await context.settingsManager.flush();
  const [settingsError] = context.settingsManager.drainErrors();
  if (settingsError) {
    throw new Error(`Could not write settings: ${settingsError.error.message}`);
  }
  return source;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reply(response: PackageWorkerResponse): void {
  process.parentPort?.postMessage(response);
}

async function operateAndReport(
  command: Extract<PackageWorkerCommand, { type: 'operate' }>,
): Promise<PiPackageOperationResult> {
  const source = await operate(createContext(command.cwd), command.operation);
  // Fresh managers: the operation changed settings and the disk under the old ones.
  const after = createContext(command.cwd);
  const root =
    command.operation.action === 'remove'
      ? undefined
      : after.packageManager.getInstalledPath(source, command.operation.scope);
  // Installed is not working: an extension that throws on load is reported
  // with the install, not left for the next check to find.
  const errors = root ? await loadErrors(after, root).catch(() => []) : [];
  return { success: true, loadErrors: errors };
}

async function handle(command: PackageWorkerCommand): Promise<void> {
  try {
    switch (command.type) {
      case 'list':
        reply({
          type: 'list_result',
          result: { success: true, snapshot: await readSnapshot(createContext(command.cwd)) },
        });
        break;
      case 'check':
        reply({
          type: 'check_result',
          result: { success: true, health: await checkHealth(createContext(command.cwd)) },
        });
        break;
      case 'operate':
        reply({ type: 'operate_result', result: await operateAndReport(command) });
        break;
    }
  } catch (error) {
    const message = errorMessage(error);
    switch (command.type) {
      case 'list':
        reply({ type: 'list_result', result: { success: false, error: message } });
        break;
      case 'check':
        reply({ type: 'check_result', result: { success: false, error: message } });
        break;
      case 'operate':
        // Main appends the npm and git output it captured.
        reply({ type: 'operate_result', result: { success: false, error: message, log: '' } });
        break;
    }
  }
}

process.parentPort?.once('message', (messageEvent) => {
  // parentPort only receives PackageWorkerCommand from main — safe narrowing
  const command: PackageWorkerCommand = messageEvent.data;
  void handle(command);
});
