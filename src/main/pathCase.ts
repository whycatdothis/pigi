import { readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/**
 * macOS resolves any case spelling of a path, but realpath does not normalize
 * case: a typed cwd like ~/work and the disk spelling ~/Work reach pigi as two
 * different strings. Session identity is keyed by path string (process pool,
 * busy set, app store, SDK store), so one session gets two identities — a
 * second process, an "idle" status, an abort that misses. The disk spelling is
 * what every other source (open dialog, directory listing) already uses.
 */
const cache = new Map<string, Promise<string>>();

export function canonicalizePathCase(path: string): Promise<string> {
  let cached = cache.get(path);
  if (!cached) {
    cached = resolveDiskCase(path).catch(() => path);
    cache.set(path, cached);
  }
  return cached;
}

async function resolveDiskCase(path: string): Promise<string> {
  const resolved = await realpath(resolve(path)).catch(() => resolve(path));
  if (sep !== '/') return resolved;
  const parts = resolved.split(sep).filter((part) => part.length > 0);
  let current: string = sep;
  for (let i = 0; i < parts.length; i++) {
    const entries = await readdir(current).catch(() => null);
    if (entries === null) return join(current, ...parts.slice(i));
    const part = parts[i];
    const variants = entries.filter((entry) => entry.toLowerCase() === part.toLowerCase());
    let disk = entries.find((entry) => entry === part);
    if (!disk && variants.length === 1) {
      // A lone variant is the disk spelling only when the volume resolves the
      // typed spelling (case-insensitive). On a case-sensitive volume the
      // typed part simply does not exist — keep it, never point at a sibling.
      if (await stat(join(current, part)).catch(() => null)) disk = variants[0];
    }
    current = join(current, disk ?? part);
  }
  return current;
}
