import { findChatReferences } from './chatReferences';
import { withoutLineSuffix } from './filePathCandidates';

/**
 * A sent prompt split into the spans that may have been chips in the composer.
 * The prompt is plain text: an `@` reference chip was sent as `@path`, and a
 * completed path chip as its absolute path, so a span is only drawn as a chip
 * once the path is known to exist.
 */
export type UserMessageSegment =
  | { kind: 'text'; start: number; text: string }
  | { kind: 'reference'; start: number; text: string; path: string }
  | { kind: 'path'; start: number; text: string; path: string };

const NO_COMMANDS: ReadonlySet<string> = new Set();

// Two segments at least, so a `/command` mentioned mid-sentence stays text.
// CJK punctuation ends a path, as it ends an `@` reference.
const ABSOLUTE_PATH_PATTERN =
  /(^|[\s(])((?:~|\/[^\s/()\u3000-\u303f\uff00-\uffef]+)\/[^\s()\u3000-\u303f\uff00-\uffef]*)/g;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?)\]}]+$/;

interface Span {
  start: number;
  end: number;
  segment: UserMessageSegment;
}

function referenceSpans(text: string): Span[] {
  return findChatReferences(text, NO_COMMANDS)
    .filter((reference) => reference.kind === 'file')
    .map((reference) => ({
      start: reference.start,
      end: reference.end,
      segment: {
        kind: 'reference',
        start: reference.start,
        text: reference.value,
        path: reference.id,
      },
    }));
}

function pathSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(ABSOLUTE_PATH_PATTERN)) {
    const start = (match.index ?? 0) + match[1].length;
    const token = match[2].replace(TRAILING_PUNCTUATION_PATTERN, '');
    const path = withoutLineSuffix(token);
    spans.push({
      start,
      end: start + path.length,
      segment: { kind: 'path', start, text: path, path },
    });
  }
  return spans;
}

export function userMessageSegments(text: string): UserMessageSegment[] {
  const spans = [...referenceSpans(text), ...pathSpans(text)].sort((a, b) => a.start - b.start);
  const segments: UserMessageSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      segments.push({ kind: 'text', start: cursor, text: text.slice(cursor, span.start) });
    }
    segments.push(span.segment);
    cursor = span.end;
  }
  if (cursor < text.length)
    segments.push({ kind: 'text', start: cursor, text: text.slice(cursor) });
  return segments;
}
