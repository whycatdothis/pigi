import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source comments are for readers of the source (~34 KB of the home page).
// Comments inside script/style/pre/textarea are content and are left alone.
const COMMENT_OR_BLOCK = /(?<block><(script|style|pre|textarea)\b[\s\S]*?<\/\2>)|<!--[\s\S]*?-->/gi;

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
          remaining += [...stripped.matchAll(COMMENT_OR_BLOCK)].filter(
            ([, block]) => block === undefined,
          ).length;
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
