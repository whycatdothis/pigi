import type { CodeNavigationRequest, CodeNavigationResponse } from '../../shared/ipcContract';
import { findDefinition } from './codeNavigation/findDefinition';
import { stopLanguageServers } from './codeNavigation/languageServer';
import { stopFinders } from './codeNavigation/searchDefinitions';

/**
 * fff's grep keeps what it read: one lookup in a 120k-file repository leaves
 * the process at ~1 GB even after the finder is destroyed. Exiting when idle
 * is what returns it; main starts a new process on the next lookup.
 */
const IDLE_EXIT_MS = 10 * 60_000;

let running = 0;
let idleTimer: NodeJS.Timeout | null = null;

function scheduleIdleExit(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = running === 0 ? setTimeout(() => process.exit(0), IDLE_EXIT_MS) : null;
}

process.parentPort?.on('message', (messageEvent) => {
  // parentPort only receives CodeNavigationRequest from main — safe narrowing
  const request: CodeNavigationRequest = messageEvent.data;
  running += 1;
  scheduleIdleExit();
  void findDefinition(request).then((result) => {
    const response: CodeNavigationResponse = { requestId: request.requestId, result };
    process.parentPort?.postMessage(response);
    running -= 1;
    scheduleIdleExit();
  });
});

process.on('exit', () => {
  stopLanguageServers();
  stopFinders();
});
