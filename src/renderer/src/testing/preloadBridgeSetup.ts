/**
 * Vitest setup: a baseline preload bridge.
 *
 * The settings store reads pigi's settings file through `window.piApi` while the
 * module is evaluated, so a test that imports anything touching the store needs
 * those members to exist first. This file runs before every test module for that
 * reason; tests that care about the value install `installPigiSettingsBridge`
 * instead. Node-environment tests have no window and skip it.
 */
if (typeof window !== 'undefined' && !('piApi' in window)) {
  Object.defineProperty(window, 'piApi', {
    value: {
      readPigiSettings: (): unknown => null,
      writePigiSettings: (): Promise<boolean> => Promise.resolve(true),
    },
    configurable: true,
    writable: true,
  });
}
