import { open, readdir, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type {
  ProjectDirectoryEntry,
  ProjectDirectoryResult,
  ProjectFileResult,
} from '../../shared/ipcContract';

/** A single directory with more children than this is capped; node_modules is the case that forces it. */
const MAX_DIRECTORY_ENTRIES = 2000;
/** The viewer is text; a read stops at this size and says so. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** `.git` is version-control plumbing, not project content; everything else stays visible. */
function isHiddenDirectory(name: string): boolean {
  return name === '.git';
}

/**
 * Resolve a project-relative path, or null when it escapes the project root.
 * This is lexical containment; readdir/stat still follow symlinks, so a link
 * inside the project can point outside. The viewer is local and read-only and
 * the agent can read those paths anyway, so this is not a trust boundary.
 */
function resolveInsideProject(projectPath: string, path: string): string | null {
  if (projectPath.trim().length === 0 || path.includes('\0')) {
    return null;
  }
  const root = resolve(projectPath);
  const target = resolve(root, path);
  const offset = relative(root, target);
  if (offset.startsWith('..') || isAbsolute(offset)) {
    return null;
  }
  return target;
}

function compareEntries(left: ProjectDirectoryEntry, right: ProjectDirectoryEntry): number {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }
  return NAME_COLLATOR.compare(left.name, right.name);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function listProjectDirectory(
  projectPath: string,
  path: string,
): Promise<ProjectDirectoryResult> {
  const directory = resolveInsideProject(projectPath, path);
  if (!directory) {
    return { success: false, error: 'The path is outside the project.' };
  }

  try {
    const dirents = await readdir(directory, { withFileTypes: true });
    const entries = await Promise.all(
      dirents.map(async (dirent): Promise<ProjectDirectoryEntry> => {
        const entryPath = path ? `${path}/${dirent.name}` : dirent.name;
        let isDirectory = dirent.isDirectory();
        // A symlink reports itself, not its target type. Resolve it so a linked
        // directory expands instead of being shown as a file.
        if (dirent.isSymbolicLink()) {
          isDirectory = await stat(resolve(directory, dirent.name))
            .then((stats) => stats.isDirectory())
            .catch(() => false);
        }
        return { name: dirent.name, path: entryPath, isDirectory };
      }),
    );

    const visible = entries.filter(
      (entry) => !(entry.isDirectory && isHiddenDirectory(entry.name)),
    );
    visible.sort(compareEntries);
    return {
      success: true,
      entries: visible.slice(0, MAX_DIRECTORY_ENTRIES),
      truncated: visible.length > MAX_DIRECTORY_ENTRIES,
    };
  } catch (error) {
    return { success: false, error: errorMessage(error, 'Unable to read this folder') };
  }
}

export async function readProjectFile(
  projectPath: string,
  path: string,
): Promise<ProjectFileResult> {
  const filePath = resolveInsideProject(projectPath, path);
  if (!filePath) {
    return { success: false, error: 'The path is outside the project.' };
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return { success: false, error: 'This path is not a file.' };
    }

    const length = Math.min(stats.size, MAX_FILE_BYTES);
    const buffer = Buffer.alloc(length);
    let offset = 0;
    const handle = await open(filePath, 'r');
    try {
      while (offset < length) {
        const { bytesRead } = await handle.read(buffer, offset, length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
    } finally {
      await handle.close();
    }

    // The file can shrink between stat and read; only inspect the bytes that
    // were actually returned, not the zero-filled rest of the buffer.
    const content = buffer.subarray(0, offset);
    if (content.includes(0)) {
      return { success: false, error: 'This file looks binary and cannot be shown as text.' };
    }

    return {
      success: true,
      content: content.toString('utf8'),
      size: stats.size,
      truncated: stats.size > MAX_FILE_BYTES,
    };
  } catch (error) {
    return { success: false, error: errorMessage(error, 'Unable to read this file') };
  }
}
