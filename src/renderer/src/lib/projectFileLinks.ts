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
 * that climb out of the project return null.
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

  const baseSegments = normalizedReference.startsWith('/')
    ? []
    : sourceFilePath.replace(/\\/g, '/').split('/').slice(0, -1);
  const segments = [...baseSegments];

  for (const segment of referenceSegments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const path = segments.join('/');
  const root = projectPath.replace(/[\\/]+$/, '');
  return { path, absolutePath: `${root}/${path}` };
}
