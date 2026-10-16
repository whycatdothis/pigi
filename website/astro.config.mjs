import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Update to the custom domain once one is attached in Cloudflare Pages.
  // `site` is what the canonical URL and the sitemap are generated from.
  site: 'https://pigi.pages.dev',
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // The whole page is small enough that inlining its stylesheet removes a
    // round trip on first paint.
    inlineStylesheets: 'always',
  },
});
