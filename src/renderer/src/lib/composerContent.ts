import type { JSONContent } from '@tiptap/core';
import {
  findChatReferences,
  formatFileReference,
  type ChatReferenceKind,
  type FindChatReferencesOptions,
} from './chatReferences';

/** Node name of the Tiptap Mention extension, which renders reference chips. */
const REFERENCE_NODE_NAME = 'mention';
const HARD_BREAK_NODE_NAME = 'hardBreak';

/** Character that opens each reference picker and prefixes its serialized text. */
export const REFERENCE_TRIGGERS = {
  skill: '/',
  file: '@',
} as const satisfies Record<ChatReferenceKind, string>;

export function referenceKindForTrigger(trigger: unknown): ChatReferenceKind {
  return trigger === REFERENCE_TRIGGERS.skill ? 'skill' : 'file';
}

/** Plain text a reference chip contributes to the prompt. */
export function serializeReference(kind: ChatReferenceKind, id: string): string {
  return kind === 'file' ? formatFileReference(id) : `${REFERENCE_TRIGGERS.skill}${id}`;
}

export function referenceNode(kind: ChatReferenceKind, id: string): JSONContent {
  return {
    type: REFERENCE_NODE_NAME,
    attrs: { id, mentionSuggestionChar: REFERENCE_TRIGGERS[kind] },
  };
}

/** Text and hard-break nodes for a plain text run. */
function plainInlineContent(text: string): JSONContent[] {
  const content: JSONContent[] = [];
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, index) => {
      if (index > 0) content.push({ type: HARD_BREAK_NODE_NAME });
      if (line.length > 0) content.push({ type: 'text', text: line });
    });
  return content;
}

/**
 * Inline composer content for plain text, turning recognised `/command` and
 * `@path` references into chips.
 */
export function inlineContentFromText(
  text: string,
  commandNames: ReadonlySet<string>,
  options?: FindChatReferencesOptions,
): JSONContent[] {
  const content: JSONContent[] = [];
  let cursor = 0;
  for (const reference of findChatReferences(text, commandNames, options)) {
    content.push(...plainInlineContent(text.slice(cursor, reference.start)));
    content.push(referenceNode(reference.kind, reference.id));
    cursor = reference.end;
  }
  content.push(...plainInlineContent(text.slice(cursor)));
  return content;
}

/** A full composer document for plain text, e.g. a restored draft. */
export function composerDocumentFromText(
  text: string,
  commandNames: ReadonlySet<string>,
): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: inlineContentFromText(text, commandNames) }],
  };
}
