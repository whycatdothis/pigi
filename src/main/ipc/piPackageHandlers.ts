import { ipcMain } from 'electron';
import {
  PiChannel,
  type PackageWorkerCommand,
  type PackageWorkerResponse,
} from '../../shared/ipcContract';
import {
  failureReason,
  type CatalogPackageDetailResult,
  type CatalogSearchResult,
  type PiPackageAction,
  type PiPackageOperation,
  type PiPackageOperationResult,
  type PiPackagesHealthResult,
  type PiPackagesResult,
} from '../../shared/piPackages';
import { createPackageWorkerProcess } from '../processes/createPiAgentProcess';
import { getCatalogPackage, searchCatalog } from '../packages/packageCatalog';
import { reloadAfterPackageChange } from './piAgentBridge';

const TIMEOUT_MS: Record<PackageWorkerCommand['type'], number> = {
  list: 30_000,
  // Network update checks plus loading every extension.
  check: 60_000,
  // npm install of a package with a large dependency tree, or a slow clone.
  operate: 10 * 60_000,
};

/** The tail is where npm and git print the reason; the head is progress noise. */
const MAX_LOG_CHARS = 20_000;
const MAX_SOURCE_LENGTH = 2_048;
const PACKAGE_ACTIONS: readonly PiPackageAction[] = ['install', 'remove', 'update'];

interface WorkerRun {
  response: PackageWorkerResponse | null;
  error: string | null;
  log: string;
}

function runPackageWorker(command: PackageWorkerCommand): Promise<WorkerRun> {
  const proc = createPackageWorkerProcess();
  let log = '';
  const append = (chunk: Buffer): void => {
    log = (log + chunk.toString('utf8')).slice(-MAX_LOG_CHARS);
  };
  // Unread pipes fill up and block npm on its next write.
  proc.stdout?.on('data', append);
  proc.stderr?.on('data', append);

  return new Promise((resolve) => {
    let response: PackageWorkerResponse | null = null;
    let error: string | null = null;
    const timer = setTimeout(() => {
      error = 'Timed out; the package manager did not finish';
      proc.kill();
    }, TIMEOUT_MS[command.type]);
    proc.once('message', (message: PackageWorkerResponse) => {
      response = message;
      proc.kill();
    });
    // Resolved on exit, not on the reply: npm's last lines travel on the
    // stdio pipes, which the reply's channel can overtake.
    proc.once('exit', (code) => {
      clearTimeout(timer);
      if (!response && !error) error = `Package worker exited with code ${code}`;
      resolve({ response, error, log: log.trim() });
    });
    proc.postMessage(command);
  });
}

function parseCwd(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function parseOperation(value: unknown): PiPackageOperation | null {
  if (typeof value !== 'object' || value === null) return null;
  const action: unknown = Reflect.get(value, 'action');
  const source: unknown = Reflect.get(value, 'source');
  const scope: unknown = Reflect.get(value, 'scope');
  const knownAction = PACKAGE_ACTIONS.find((candidate) => candidate === action);
  if (!knownAction) return null;
  if (typeof source !== 'string' || !source.trim() || source.length > MAX_SOURCE_LENGTH) {
    return null;
  }
  if (scope !== 'user' && scope !== 'project') return null;
  return { action: knownAction, source: source.trim(), scope };
}

// One at a time: two npm installs into the same prefix race on its lockfile.
let operationQueue: Promise<unknown> = Promise.resolve();

function enqueueOperation(
  cwd: string | null,
  operation: PiPackageOperation,
): Promise<PiPackageOperationResult> {
  const run = operationQueue.then(async (): Promise<PiPackageOperationResult> => {
    const { response, error, log } = await runPackageWorker({ type: 'operate', cwd, operation });
    if (response?.type !== 'operate_result') {
      return { success: false, error: error ?? 'No answer from the package worker', log };
    }
    if (!response.result.success) {
      const { error: thrown } = response.result;
      return {
        success: false,
        error: failureReason(log) ?? thrown,
        log: [log, thrown].filter(Boolean).join('\n'),
      };
    }
    reloadAfterPackageChange();
    return response.result;
  });
  operationQueue = run.catch(() => {});
  return run;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerPiPackageHandlers(): void {
  ipcMain.handle(
    PiChannel.ListPiPackages,
    async (_e, rawCwd: unknown): Promise<PiPackagesResult> => {
      const cwd = parseCwd(rawCwd);
      if (cwd === undefined) return { success: false, error: 'cwd must be a string or null' };
      const { response, error } = await runPackageWorker({ type: 'list', cwd });
      return response?.type === 'list_result'
        ? response.result
        : { success: false, error: error ?? 'No answer from the package worker' };
    },
  );

  ipcMain.handle(
    PiChannel.CheckPiPackages,
    async (_e, rawCwd: unknown): Promise<PiPackagesHealthResult> => {
      const cwd = parseCwd(rawCwd);
      if (cwd === undefined) return { success: false, error: 'cwd must be a string or null' };
      const { response, error } = await runPackageWorker({ type: 'check', cwd });
      return response?.type === 'check_result'
        ? response.result
        : { success: false, error: error ?? 'No answer from the package worker' };
    },
  );

  ipcMain.handle(
    PiChannel.RunPiPackageOperation,
    async (_e, rawCwd: unknown, rawOperation: unknown): Promise<PiPackageOperationResult> => {
      const cwd = parseCwd(rawCwd);
      const operation = parseOperation(rawOperation);
      if (cwd === undefined || operation === null) {
        return { success: false, error: 'invalid package operation', log: '' };
      }
      return enqueueOperation(cwd, operation);
    },
  );

  ipcMain.handle(
    PiChannel.SearchPiPackageCatalog,
    async (_e, query: unknown): Promise<CatalogSearchResult> => {
      if (typeof query !== 'string' || query.length > 200) {
        return { success: false, error: 'query must be a string of at most 200 characters' };
      }
      try {
        return { success: true, ...(await searchCatalog(query)) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    PiChannel.GetPiCatalogPackage,
    async (_e, name: unknown): Promise<CatalogPackageDetailResult> => {
      if (typeof name !== 'string' || !/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) {
        return { success: false, error: 'invalid package name' };
      }
      try {
        return { success: true, detail: await getCatalogPackage(name) };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );
}
