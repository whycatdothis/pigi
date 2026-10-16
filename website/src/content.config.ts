import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { resolve } from 'node:path';

/**
 * The changelog, read from the app's own CHANGELOG.md.
 *
 * There is one changelog in this repository and it lives at the root, because it
 * is the file the release workflow parses to write the GitHub release notes. The
 * site renders that same file rather than keeping a second copy that could fall
 * behind it.
 *
 * `base` is an absolute path for the same reason `site.ts` reads the version from
 * the working directory: this module runs after bundling, so a relative walk from
 * `import.meta.url` would start in a build artifact.
 */
const changelog = defineCollection({
  loader: glob({ base: resolve(process.cwd(), '..'), pattern: 'CHANGELOG.md' }),
});

export const collections = { changelog };
