import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Unit and component tests.
 *
 * The components are plain React with a fake preload bridge, so they run in jsdom
 * (marked per file with `// @vitest-environment jsdom`). What jsdom cannot answer —
 * real layout, scrolling, overflow — lives in the `*.browser.test` files, which
 * `vitest.browser.config.ts` runs on their own: they need a Chromium download, so
 * they stay out of the default run and out of CI.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'src/**/*.browser.test.{ts,tsx}'],
  },
});
