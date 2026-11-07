import type { Element, ElementContent, Properties, Root, RootContent, Text } from 'hast';
import { filePathFromCode, findFilePathCandidates, type FileLocation } from './filePathCandidates';

/**
 * Mark path-shaped text in rendered chat markdown with `data-file-path` (and
 * its line range), for the markdown components to turn into a link once the
 * file is known to exist. Prose paths get a wrapping `<span>`; an inline code
 * span that holds only a path is marked itself. Runs after sanitizing, so the
 * attributes can only come from here.
 */
const FILE_PATH_PROPERTY = 'dataFilePath';
const LINE_START_PROPERTY = 'dataFileLineStart';
const LINE_END_PROPERTY = 'dataFileLineEnd';

function fileProperties({ path, lines }: FileLocation): Properties {
  return lines
    ? {
        [FILE_PATH_PROPERTY]: path,
        [LINE_START_PROPERTY]: lines.start,
        [LINE_END_PROPERTY]: lines.end,
      }
    : { [FILE_PATH_PROPERTY]: path };
}

/** The file this plugin marked on an element, if any. */
export function markedFileLocation(properties: Properties | undefined): FileLocation | null {
  const path = properties?.[FILE_PATH_PROPERTY];
  if (typeof path !== 'string') return null;
  const start = properties?.[LINE_START_PROPERTY];
  const end = properties?.[LINE_END_PROPERTY];
  return {
    path,
    lines: typeof start === 'number' && typeof end === 'number' ? { start, end } : null,
  };
}

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
      properties: fileProperties(candidate),
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
        const location = filePathFromCode(codeText(child));
        if (location) Object.assign(child.properties, fileProperties(location));
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
