import { formatFileReference } from './chatReferences';
import { formatLineSuffix } from './filePathCandidates';
import { DIFF_LINE_PREFIX, type GitDiffSourceLine } from './gitDiffPatch';
import type { QuoteContent } from './messageQuotes';
import { projectAbsolutePath } from './projectFileLinks';

/**
 * A quote's path: project-relative while viewing the session's own project,
 * absolute when browsing another, because the agent resolves references
 * against the session's project.
 */
export function projectQuotePath(
  projectPath: string,
  sessionProjectPath: string | null,
  path: string,
): string {
  return sessionProjectPath && sessionProjectPath !== projectPath
    ? projectAbsolutePath(projectPath, path)
    : path;
}

/**
 * A path as a pi file reference, relative to the project root, with the text
 * the lines hold: the reference says where to look, the text says what the
 * comment is about.
 */
export function formatFileLineQuote(
  path: string,
  startLine: number,
  endLine: number,
  text: string,
): QuoteContent {
  const lines = { start: Math.min(startLine, endLine), end: Math.max(startLine, endLine) };
  return { reference: `${formatFileReference(path)}${formatLineSuffix(lines)}`, text };
}

/** Rendered markdown has no source lines to point at, so the quote carries the text itself. */
export function formatFileContentQuote(path: string, text: string): QuoteContent {
  return { reference: formatFileReference(path), text };
}

/** A comment on a file's whole diff: `@src/app.ts, diff against origin/main`. */
export function formatFileScopeQuote(path: string, scope: string): QuoteContent {
  return { reference: `${formatFileReference(path)}, ${scope}`, text: '' };
}

/**
 * Diff lines the agent cannot open by line number (deleted, or from a commit),
 * as a unified diff under what they were compared with, so it reads them as
 * removed or added code rather than the file's current text:
 * `@src/app.ts, diff against origin/main:` then `-old` / `+new` lines.
 */
export function formatFileDiffQuote(
  path: string,
  scope: string,
  lines: readonly Pick<GitDiffSourceLine, 'kind' | 'text'>[],
): QuoteContent {
  return {
    reference: `${formatFileReference(path)}, ${scope}:`,
    text: lines.map((line) => `${DIFF_LINE_PREFIX[line.kind]}${line.text}`).join('\n'),
  };
}

/**
 * A quote taken from a diff opens with the branch it was read on. Two branches
 * that forked from the same base compare against the same base and carry the
 * same line numbers, so the scope alone does not say which one is meant, and a
 * removed line exists only on the branch that removed it.
 */
export function withQuoteBranch(quote: QuoteContent, branch: string | null): QuoteContent {
  return branch
    ? { reference: `on branch ${branch}: ${quote.reference ?? ''}`, text: quote.text }
    : quote;
}
