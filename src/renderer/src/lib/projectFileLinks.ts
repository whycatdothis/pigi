export interface ProjectFileReference {
  /** Path relative to the project root, `/` separated. */
  path: string;
  /** Absolute path, ready for the local-file protocol. */
  absolutePath: string;
}

const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/**
 * Resolve a markdown link or image against the file that contains it. Relative
 * references are confined to the project root; URLs, anchors and references
 * that climb out of the project return null. `path` is project-relative, or
 * absolute when the containing file is.
 */
export function resolveProjectFileReference(
  projectPath: string,
  sourceFilePath: string,
  reference: string,
): ProjectFileReference | null {
  const rawReference = reference.trim();
  if (
    !rawReference ||
    rawReference.startsWith('#') ||
    rawReference.startsWith('?') ||
    rawReference.startsWith('//') ||
    URL_SCHEME_PATTERN.test(rawReference)
  ) {
    return null;
  }

  const pathPart = rawReference.split(/[?#]/)[0];
  if (!pathPart) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }

  const normalizedReference = decoded.replace(/\\/g, '/');
  if (normalizedReference.startsWith('//')) {
    return null;
  }
  const referenceSegments = normalizedReference.split('/').filter(Boolean);
  const lastReferenceSegment = referenceSegments.at(-1);
  if (
    lastReferenceSegment === undefined ||
    lastReferenceSegment === '.' ||
    lastReferenceSegment === '..'
  ) {
    return null;
  }

  // A file outside the project (opened from a chat link) has no project root:
  // its links resolve beside it, and the root segment cannot be climbed past.
  const sourceIsAbsolute = isAbsoluteFilePath(sourceFilePath);
  if (sourceIsAbsolute && normalizedReference.startsWith('/')) {
    return null;
  }
  const baseSegments = normalizedReference.startsWith('/')
    ? []
    : sourceFilePath.replace(/\\/g, '/').split('/').slice(0, -1);
  const rootDepth = sourceIsAbsolute ? 1 : 0;
  const segments = [...baseSegments];

  for (const segment of referenceSegments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length <= rootDepth) {
        return null;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const path = segments.join('/');
  if (sourceIsAbsolute) {
    return { path, absolutePath: path };
  }
  const root = projectPath.replace(/[\\/]+$/, '');
  return { path, absolutePath: `${root}/${path}` };
}

/** POSIX `/…`, a Windows drive `C:\…` or a UNC `\\server\…` path. */
export function isAbsoluteFilePath(path: string): boolean {
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path);
}

/**
 * The Files tab names a project file by its project-relative path; a file
 * outside the project keeps its absolute path.
 */
export function projectRelativePath(projectPath: string, path: string): string {
  if (!isAbsoluteFilePath(path)) return path;
  const normalized = path.replace(/\\/g, '/');
  const root = `${projectPath.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
  return normalized.startsWith(root) ? normalized.slice(root.length) : path;
}

/** A project file's absolute path, for a reference read from another project. */
export function projectAbsolutePath(projectPath: string, path: string): string {
  if (isAbsoluteFilePath(path)) return path;
  return `${projectPath.replace(/[\\/]+$/, '')}/${path.replace(/\\/g, '/')}`;
}
