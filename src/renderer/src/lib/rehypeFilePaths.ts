import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import { filePathFromCode, findFilePathCandidates } from './filePathCandidates';

/**
 * Mark path-shaped text in rendered chat markdown with `data-file-path`, for
 * the markdown components to turn into a link once the file is known to exist.
 * Prose paths get a wrapping `<span>`; an inline code span that holds only a
 * path is marked itself. Runs after sanitizing, so the attribute can only come
 * from here.
 */
export const FILE_PATH_PROPERTY = 'dataFilePath';

function splitText(node: Text): ElementContent[] | null {
  const candidates = findFilePathCandidates(node.value);
  if (candidates.length === 0) return null;
  const parts: ElementContent[] = [];
  let cursor = 0;
  for (const candidate of candidates) {
    if (candidate.start > cursor) {
      parts.push({ type: 'text', value: node.value.slice(cursor, candidate.start) });
    }
    parts.push({
      type: 'element',
      tagName: 'span',
      properties: { [FILE_PATH_PROPERTY]: candidate.path },
      children: [{ type: 'text', value: node.value.slice(candidate.start, candidate.end) }],
    });
    cursor = candidate.end;
  }
  if (cursor < node.value.length) parts.push({ type: 'text', value: node.value.slice(cursor) });
  return parts;
}

function codeText(element: Element): string {
  return element.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
}

function markChildren<T extends RootContent>(children: T[]): (T | ElementContent)[] {
  const marked: (T | ElementContent)[] = [];
  for (const child of children) {
    if (child.type === 'text') {
      marked.push(...(splitText(child) ?? [child]));
      continue;
    }
    if (child.type === 'element') {
      if (child.tagName === 'code') {
        const path = filePathFromCode(codeText(child));
        if (path) child.properties[FILE_PATH_PROPERTY] = path;
      } else if (child.tagName !== 'a' && child.tagName !== 'pre') {
        child.children = markChildren(child.children);
      }
    }
    marked.push(child);
  }
  return marked;
}

export default function rehypeFilePaths(): (tree: Root) => void {
  return (tree) => {
    tree.children = markChildren(tree.children);
  };
}
