import { join } from 'node:path';
import { app } from 'electron';
import { TREE_SITTER_DIRECTORY_ENV } from '../../shared/codeNavigation';
import type {
  CodeNavigationRequest,
  CodeNavigationResponse,
  FindDefinitionResult,
} from '../../shared/ipcContract';
import { createCodeNavigationProcess } from '../processes/createPiAgentProcess';
import { initializeShellEnv } from '../processes/shellEnvResolver';
import { pointToUnpackedLibrary } from './projectFileSearch';

/** A full search of a 120k-file repository takes seconds; this only catches a wedged process. */
const REQUEST_TIMEOUT_MS = 60_000;

let worker: Promise<Electron.UtilityProcess> | null = null;
let nextRequestId = 1;
const pending = new Map<number, (result: FindDefinitionResult) => void>();

function treeSitterDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'treeSitter')
    : join(app.getAppPath(), 'resources', 'treeSitter');
}

async function startWorker(): Promise<Electron.UtilityProcess> {
  // Language servers are found on the login shell's PATH, not launchd's.
  await initializeShellEnv();
  pointToUnpackedLibrary();
  const child = createCodeNavigationProcess({
    ...process.env,
    [TREE_SITTER_DIRECTORY_ENV]: treeSitterDirectory(),
  });
  child.on('message', (response: CodeNavigationResponse) => {
    pending.get(response.requestId)?.(response.result);
    pending.delete(response.requestId);
  });
  child.once('exit', () => {
    worker = null;
    for (const resolve of pending.values()) {
      resolve({ success: false, error: 'The code navigation process exited' });
    }
    pending.clear();
  });
  return child;
}

/** Started on the first lookup and restarted on the next one after it exits. */
export async function findDefinition(
  cwd: string,
  filePath: string,
  line: number,
  column: number,
): Promise<FindDefinitionResult> {
  worker ??= startWorker().catch((error: unknown) => {
    worker = null;
    throw error;
  });
  let child: Electron.UtilityProcess;
  try {
    child = await worker;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to start code navigation',
    };
  }
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ success: false, error: 'Timed out looking for the definition' });
    }, REQUEST_TIMEOUT_MS);
    pending.set(requestId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    const request: CodeNavigationRequest = { requestId, cwd, filePath, line, column };
    child.postMessage(request);
  });
}
