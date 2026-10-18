import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectFilesResult } from '../../shared/ipcContract';

const execFileAsync = promisify(execFile);

const GIT_EXECUTABLE = 'git';
const GIT_LS_FILES_ARGS = ['ls-files', '--cached', '--others', '--exclude-standard', '-z'] as const;
const GIT_TIMEOUT_MS = 3000;
const MAX_PROJECT_FILES = 50000;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/**
 * List files a user can reference from the composer. Uses the git index plus
 * untracked, non-ignored files so node_modules and build output stay out.
 */
export async function listProjectFiles(cwd: string): Promise<ProjectFilesResult> {
  if (!cwd || cwd.trim().length === 0) {
    return { success: false, error: 'cwd must be a non-empty string' };
  }

  try {
    const { stdout } = await execFileAsync(GIT_EXECUTABLE, [...GIT_LS_FILES_ARGS], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
    });
    const files = stdout.split('\0').filter((file) => file.length > 0);
    return { success: true, files: files.slice(0, MAX_PROJECT_FILES) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to list project files',
    };
  }
}
