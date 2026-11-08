/**
 * Hands uncaught renderer errors to main, which sends them only when telemetry
 * is on. An `error` event without an Error object (a ResizeObserver loop notice,
 * a failed resource load) has no stack to fix anything with and is skipped.
 */
function report(error: unknown): void {
  if (!(error instanceof Error)) return;
  window.piApi.reportTelemetry({
    type: 'exception',
    name: error.name,
    message: error.message,
    stack: error.stack,
  });
}

export function installErrorReporting(): void {
  window.addEventListener('error', (event) => report(event.error));
  window.addEventListener('unhandledrejection', (event) => report(event.reason));
}
