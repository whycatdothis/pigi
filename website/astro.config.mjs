import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { stripHtmlComments } from './scripts/stripHtmlComments.mjs';

export default defineConfig({
  site: 'https://pigi.pink',
  vite: {
    // Name the tsconfig explicitly: walking up finds the app's root tsconfig, which
    // extends @electron-toolkit/tsconfig and fails in CI/Cloudflare where only
    // website/ is installed.
    tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
    plugins: [tailwindcss()],
  },
  integrations: [stripHtmlComments()],
  build: {
    // Same reason as vite.tsconfig above, for rolldown.
    rollupOptions: { tsconfig: new URL('./tsconfig.json', import.meta.url).pathname },
    // One cached sheet shared by all pages instead of a ~58 KB copy inlined into each.
    inlineStylesheets: 'never',
  },
});
