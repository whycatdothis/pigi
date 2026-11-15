import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const PIGI_DEBUG_PANEL_ENV = 'PIGI_DEBUG_PANEL';
const PIGI_DEBUG_PANEL_ENABLED_VALUE = '1';
const pigiDebugPanelEnabled = process.env[PIGI_DEBUG_PANEL_ENV] === PIGI_DEBUG_PANEL_ENABLED_VALUE;
// Set only by the release workflow, so dev and fork builds send no telemetry.
const PIGI_TELEMETRY_URL_ENV = 'PIGI_TELEMETRY_URL';
const pigiTelemetryUrl = process.env[PIGI_TELEMETRY_URL_ENV] ?? '';

export default defineConfig({
  main: {
    define: {
      __PIGI_DEBUG_PANEL__: JSON.stringify(pigiDebugPanelEnabled),
      __PIGI_TELEMETRY_URL__: JSON.stringify(pigiTelemetryUrl),
    },
    build: {
      rollupOptions: {
        // node-pty is a native module: keep it external so it loads its
        // rebuilt .node binary from node_modules at runtime instead of being
        // bundled (which would break the native require).
        external: ['node-pty'],
        input: {
          index: resolve('src/main/index.ts'),
          'processes/utility/piAgent': resolve('src/processes/utility/piAgent.ts'),
          'processes/utility/sessionWorker': resolve('src/processes/utility/sessionWorker.ts'),
          'processes/utility/terminal': resolve('src/processes/utility/terminal.ts'),
          'processes/utility/packageWorker': resolve('src/processes/utility/packageWorker.ts'),
          // The `pigi` CLI; resources/bin/pigi runs it with Electron in Node mode.
          cli: resolve('src/cli/pigi.ts'),
        },
        output: {
          format: 'es',
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        // CommonJS, because a sandboxed preload cannot be an ES module
        // (`sandbox: true` in windows/createMainWindow.ts). The package is
        // `type: module`, so electron-vite emits `index.cjs`.
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [tailwindcss(), react()],
    build: {
      rollupOptions: {
        // Two entries: the update progress window is a 400px dialog that would
        // otherwise parse the chat app's whole bundle before it can paint.
        input: {
          index: resolve('src/renderer/index.html'),
          updateProgress: resolve('src/renderer/updateProgress.html'),
        },
      },
      // electron-vite leaves the renderer unminified by default, and the
      // bundle is what the window parses before its first frame.
      minify: 'esbuild',
      // 'hidden' writes the maps without the sourceMappingURL comment: the
      // release workflow uploads them as release assets to decode minified
      // telemetry stacks; they are excluded from the app bundle.
      sourcemap: 'hidden',
    },
  },
});
