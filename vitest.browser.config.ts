import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';

/**
 * The browser tests: the same components, mounted in a real Chromium.
 *
 * Kept out of `vitest.config.ts` (and so out of `npm test` and CI) because they
 * need a downloaded browser and a page per test — they exist for the things jsdom
 * cannot answer: measured row heights, real scrolling, text that overflows its box.
 * Docs: docs/testing.md.
 */
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    include: ['src/**/*.browser.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      // The app is a desktop window; the dialog sizes itself off the viewport.
      instances: [{ browser: 'chromium', viewport: { width: 1200, height: 820 } }],
    },
  },
});
