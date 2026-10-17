import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { stripHtmlComments } from './scripts/stripHtmlComments.mjs';

export default defineConfig({
  // `site` is what the canonical URL and the Open Graph tags are generated
  // from, and what any absolute link in the page is built on; it has to be the
  // address a reader actually arrives at.
  site: 'https://pigi.pink',
  vite: {
    /*
     * Which `tsconfig.json` to compile with, named here rather than discovered.
     *
     * Left to itself, Vite finds the config by walking up from each file. This
     * project sits inside a repository whose root has a `tsconfig.json` of its own
     * — one that only lists `references` to `tsconfig.node.json` and
     * `tsconfig.web.json`, which extend `@electron-toolkit/tsconfig`. That resolves
     * on a machine with the app installed and fails everywhere else with "Tsconfig
     * not found", which is exactly what a clean CI checkout and a Cloudflare build
     * are: `website/` installed, nothing above it.
     *
     * There is one tsconfig in this project. This is it.
     */
    tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
    plugins: [tailwindcss()],
  },
  // Notes about how a page was built are for whoever reads the source; they are
  // removed from what ships.
  integrations: [stripHtmlComments()],
  build: {
    /*
     * Vite asks rolldown to find each file's `tsconfig.json` by walking up from
     * that file, and this project sits inside a monorepo-shaped directory: the
     * walk reaches the app's root, whose `tsconfig.json` only lists `references`
     * to `tsconfig.node.json` and `tsconfig.web.json`, which in turn extend
     * `@electron-toolkit/tsconfig`. That resolves on a machine with the app
     * installed and fails anywhere else — a CI job or a Cloudflare build installs
     * `website/` and nothing above it.
     *
     * There is exactly one tsconfig in this project, so it is named here.
     */
    rollupOptions: { tsconfig: new URL('./tsconfig.json', import.meta.url).pathname },
    /*
     * The stylesheet is one file for the whole site, not a copy inlined into each
     * page. Inlining saved a round trip when there was one page and its sheet was
     * the only thing to fetch; with two, the second page would carry a duplicate
     * copy of a 58 KB sheet it cannot share, and a reader who comes back pays for it
     * again. One hashed file is fetched once and cached with the HTML that links it.
     */
    inlineStylesheets: 'never',
  },
});
