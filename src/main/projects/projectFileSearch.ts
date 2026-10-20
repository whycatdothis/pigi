import { sep } from 'node:path';
import { app } from 'electron';
import { FileFinder, findBinary } from '@ff-labs/fff-node';
import type { ProjectFileSearchResult } from '../../shared/ipcContract';

const MAX_MATCHES = 20;
/** Each finder keeps an index and a file watcher alive; bound how many stay open. */
const MAX_OPEN_FINDERS = 4;
/** First search in a project waits this long for the initial scan before using a partial index. */
const INITIAL_SCAN_WAIT_MS = 3000;
const LIBRARY_PATH_ENV = 'FFF_C_LIB';
const ASAR_SEGMENT = `app.asar${sep}`;
const UNPACKED_ASAR_SEGMENT = `app.asar.unpacked${sep}`;

/** Open finders by project path; Map insertion order doubles as LRU order. */
const finders = new Map<string, FileFinder>();

/**
 * In a packaged app fff resolves its native library inside app.asar, which
 * dlopen cannot read. Point it at the unpacked copy (see asarUnpack in
 * electron-builder.yml).
 *
 * FFF_C_LIB first shipped in fff-node 0.11.1; package.json pins the
 * 0.11.1-nightly.51649e1 build for it. TODO: move to the latest stable
 * release once 0.11.1 is out.
 */
function pointToUnpackedLibrary(): void {
  if (!app.isPackaged || process.env[LIBRARY_PATH_ENV]) return;
  const libraryPath = findBinary();
  if (libraryPath?.includes(ASAR_SEGMENT)) {
    process.env[LIBRARY_PATH_ENV] = libraryPath.replace(ASAR_SEGMENT, UNPACKED_ASAR_SEGMENT);
  }
}

function getFinder(cwd: string): FileFinder {
  const existing = finders.get(cwd);
  if (existing) {
    finders.delete(cwd);
    finders.set(cwd, existing);
    return existing;
  }

  pointToUnpackedLibrary();
  // Only path search is used, so skip the content cache and index built for grep.
  const created = FileFinder.create({
    basePath: cwd,
    disableMmapCache: true,
    disableContentIndexing: true,
  });
  if (!created.ok) throw new Error(created.error);

  finders.set(cwd, created.value);
  if (finders.size > MAX_OPEN_FINDERS) {
    const [oldestPath, oldest] = finders.entries().next().value ?? [];
    if (oldestPath !== undefined && oldest) {
      finders.delete(oldestPath);
      oldest.destroy();
    }
  }
  return created.value;
}

/**
 * Fuzzy-search files for `@` references. An empty query returns no files but
 * starts indexing the project, so results are ready by the first keystroke.
 */
export async function searchProjectFiles(
  cwd: string,
  query: string,
): Promise<ProjectFileSearchResult> {
  if (!cwd || cwd.trim().length === 0) {
    return { success: false, error: 'cwd must be a non-empty string' };
  }

  try {
    const finder = getFinder(cwd);
    const trimmed = query.trim();
    if (trimmed.length === 0) return { success: true, files: [] };

    // A timed-out first scan still has a usable partial index; only a failed
    // wait means the finder cannot answer at all.
    if (finder.isScanning()) {
      const scan = await finder.waitForScan(INITIAL_SCAN_WAIT_MS);
      if (!scan.ok) return { success: false, error: scan.error };
    }
    const result = finder.fileSearch(trimmed, { pageSize: MAX_MATCHES });
    if (!result.ok) return { success: false, error: result.error };
    return { success: true, files: result.value.items.map((item) => item.relativePath) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to search project files',
    };
  }
}

export function stopProjectFileSearch(): void {
  for (const finder of finders.values()) finder.destroy();
  finders.clear();
}
