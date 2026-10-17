import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { stripHtmlComments } from './scripts/stripHtmlComments.mjs';

export default defineConfig({
  // `site` is what the canonical URL, the Open Graph tags and the sitemap are
  // generated from; it has to be the address a reader actually arrives at.
  site: 'https://pigi.pink',
  vite: {
    plugins: [tailwindcss()],
  },
  // Notes about how a page was built are for whoever reads the source; they are
  // removed from what ships.
  integrations: [stripHtmlComments()],
  build: {
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
