import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A build integration that takes the HTML comments out of the pages it emitted.
 *
 * The comments in the source are for whoever reads the source: why the hero is
 * pulled up under the header, why a tooltip is a sibling of its button, where a
 * class came from. Astro copies them into the build, which sends a reader's
 * bandwidth to notes about the page's own implementation and ships the reasoning
 * to every visitor. They are worth ~34 KB of the home page.
 *
 * Comments inside `<script>`, `<style>`, `<pre>` and `<textarea>` are left alone:
 * those are content, not markup, and a `<!--` in a code sample is part of the code
 * sample. Everything is removed in one pass, so a block that opens before a comment
 * cannot be reached into.
 */
const COMMENT_OR_BLOCK = /(?<block><(script|style|pre|textarea)\b[\s\S]*?<\/\2>)|<!--[\s\S]*?-->/gi;

/** Every `.html` file under a directory, at any depth. */
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(path)));
    else if (extname(entry.name) === '.html') files.push(path);
  }
  return files;
}

export function stripHtmlComments() {
  return {
    name: 'pig-website:strip-html-comments',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        let saved = 0;
        let remaining = 0;

        for (const file of await htmlFiles(root)) {
          const html = await readFile(file, 'utf8');
          const stripped = html.replace(COMMENT_OR_BLOCK, (match, block) =>
            block === undefined ? '' : match,
          );
          if (stripped === html) continue;
          saved += Buffer.byteLength(html) - Buffer.byteLength(stripped);
          remaining += (stripped.match(/<!--/g) ?? []).length;
          await writeFile(file, stripped);
        }

        if (saved === 0 && remaining === 0) {
          logger.warn('no HTML comments were found to strip');
          return;
        }
        logger.info(`stripped ${(saved / 1024).toFixed(1)} KB of HTML comments`);
        if (remaining > 0) {
          throw new Error(`${remaining} HTML comments survived the strip`);
        }
      },
    },
  };
}
