import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FindDefinitionResult } from '../../../shared/ipcContract';
import { findDefinition } from './findDefinition';

export async function writeFiles(base: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), content);
  }
}

/** `line` is 1-based, `column` 0-based, as the renderer sends them. */
export async function lookup(
  cwd: string,
  filePath: string,
  line: number,
  column: number,
): Promise<FindDefinitionResult> {
  return findDefinition({ requestId: 1, cwd, filePath, line, column });
}

export function located(result: FindDefinitionResult): string[] {
  if (!result.success) throw new Error(result.error);
  return result.definitions.map((definition) => `${definition.filePath}:${definition.line}`);
}
