import { stat } from 'node:fs/promises';

/**
 * `local-file:` serves images the renderer names — a message's file, a tool's
 * screenshot, a project file's picture. The renderer only ever appends the path
 * to the scheme, so anything that is not a plain, small file is refused here:
 * a model-authored path or a symlink in a cloned repo can name `/dev/zero` or a
 * multi-gigabyte file, and reading either stalls the main process.
 */
const MAX_LOCAL_FILE_BYTES = 64 * 1024 * 1024;

/**
 * The path a `local-file:` URL names. One encoded segment, so a literal `?` can
 * only start the query the renderer adds to bust a stale image cache.
 */
export function localFileUrlPath(url: string): string | null {
  if (!url.startsWith('local-file://')) return null;
  const [encodedPath] = url.slice('local-file://'.length).split('?');
  if (!encodedPath) return null;
  let path: string;
  try {
    path = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
  return path.startsWith('/') ? path : null;
}

/** The path to serve, or null when the URL does not name a readable regular file. */
export async function resolveLocalFile(url: string): Promise<string | null> {
  const path = localFileUrlPath(url);
  if (path === null) return null;
  const stats = await stat(path).catch(() => null);
  // A device, a FIFO or a directory has no size to trust; only a regular file
  // can be handed to the image decoder.
  if (!stats?.isFile() || stats.size > MAX_LOCAL_FILE_BYTES) return null;
  return path;
}
