import { ReactNodeViewRenderer, type Extensions, type Range } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  exitSuggestion,
  type SuggestionMatch,
  type SuggestionOptions,
  type SuggestionProps,
  type Trigger,
} from '@tiptap/suggestion';
import type { PathCompletionEntry } from '../../../../shared/ipcContract';
import type { ChatReferenceKind } from '../../lib/chatReferences';
import { findPathTokenAtEnd } from '../../lib/pathReferences';
import {
  REFERENCE_TRIGGERS,
  referenceKindForTrigger,
  serializeReference,
} from '../../lib/composerContent';
import { PathChip } from './pathChip';
import { ReferenceChip } from './referenceChip';

/** An open `/` or `@` picker in the composer. */
export interface ComposerSuggestion {
  kind: ChatReferenceKind;
  /** Text typed after the trigger character. */
  query: string;
  /** Document range of the trigger and query, replaced on selection. */
  range: Range;
  /** Replace the trigger and query with a reference chip. */
  insertReference: (id: string) => void;
}

const SUGGESTION_KEYS: Record<ChatReferenceKind, PluginKey> = {
  skill: new PluginKey('composerCommandSuggestion'),
  file: new PluginKey('composerFileSuggestion'),
};
const PATH_SUGGESTION_KEY = new PluginKey('composerPathSuggestion');
const PATH_TRIGGER = '/';
const PATH_REFERENCE_NODE_NAME = 'pathReference';

/** Position right after the opening paragraph tag, i.e. the start of the prompt. */
export const COMPOSER_TEXT_START = 1;

/** Close the picker of `kind` if it is open. */
export function exitReferenceSuggestion(view: EditorView, kind: ChatReferenceKind): void {
  const key = SUGGESTION_KEYS[kind];
  if (key.getState(view.state)?.active) exitSuggestion(view, key);
}

/**
 * Close every picker. Used after programmatic text changes (drafts, history,
 * restores) so a recalled `/...` or `@...` token does not open a picker that
 * would capture the arrow keys.
 */
export function exitReferenceSuggestions(view: EditorView): void {
  for (const key of [...Object.values(SUGGESTION_KEYS), PATH_SUGGESTION_KEY]) {
    if (key.getState(view.state)?.active) exitSuggestion(view, key);
  }
}

interface ComposerExtensionOptions {
  placeholder: string;
  /** Called with the open picker, or `null` when the picker of `kind` closes. */
  onSuggestionChange: (kind: ChatReferenceKind, suggestion: ComposerSuggestion | null) => void;
  /** Called with the open path picker, or `null` when it closes. */
  onPathSuggestionChange: (suggestion: PathSuggestion | null) => void;
}

/** An open path picker in the composer. */
export interface PathSuggestion {
  /** The typed path token, e.g. `src/renderer`. */
  token: string;
  /** Document range of the token, replaced on selection. */
  range: Range;
  /** Replace the token with a file or directory chip. */
  insert: (entry: PathCompletionEntry) => void;
}

/** Items are computed by the composer, so the plugin itself never lists any. */
type ReferenceSuggestionProps = SuggestionProps<unknown, MentionNodeAttrs>;

function suggestionRenderer(
  kind: ChatReferenceKind,
  onSuggestionChange: ComposerExtensionOptions['onSuggestionChange'],
): SuggestionOptions<unknown, MentionNodeAttrs>['render'] {
  return () => {
    const publish = (props: ReferenceSuggestionProps): void => {
      onSuggestionChange(kind, {
        kind,
        query: props.query,
        range: props.range,
        insertReference: (id) => props.command({ id }),
      });
    };
    return {
      onStart: publish,
      onUpdate: publish,
      onExit: () => onSuggestionChange(kind, null),
    };
  };
}

function findPathSuggestionMatch(config: Trigger): SuggestionMatch {
  const nodeBefore = config.$position.nodeBefore;
  if (!nodeBefore?.isText) return null;

  const text = nodeBefore.text ?? '';
  const token = findPathTokenAtEnd(text);
  if (!token) return null;

  const from = config.$position.pos - text.length + token.startOffset;
  // The first `/` belongs to the slash-command picker, not to a path.
  if (from === COMPOSER_TEXT_START && token.token.startsWith(PATH_TRIGGER)) return null;

  return {
    range: { from, to: config.$position.pos },
    query: token.token,
    text: token.token,
  };
}

function pathSuggestionRenderer(
  onPathSuggestionChange: ComposerExtensionOptions['onPathSuggestionChange'],
): SuggestionOptions<unknown, MentionNodeAttrs>['render'] {
  return () => {
    const publish = (props: ReferenceSuggestionProps): void => {
      onPathSuggestionChange({
        token: props.query,
        range: props.range,
        insert: (entry) => {
          props.editor
            .chain()
            .focus()
            .insertContentAt(props.range, [
              {
                type: PATH_REFERENCE_NODE_NAME,
                attrs: {
                  id: entry.path,
                  pathKind: entry.isDirectory ? 'directory' : 'file',
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
      });
    };
    return {
      onStart: publish,
      onUpdate: publish,
      onExit: () => onPathSuggestionChange(null),
    };
  };
}

const ReferenceMention = Mention.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ReferenceChip, { as: 'span' });
  },
});

const PathMention = Mention.extend({
  name: PATH_REFERENCE_NODE_NAME,
  addAttributes() {
    return {
      ...this.parent?.(),
      pathKind: {
        default: 'file',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-path-kind') ?? 'file',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-path-kind': String(attributes.pathKind),
        }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(PathChip, { as: 'span' });
  },
});

/**
 * Plain-text composer: a single paragraph with hard breaks, reference chips,
 * undo history and a placeholder. No marks or block formatting.
 */
export function createComposerExtensions({
  placeholder,
  onSuggestionChange,
  onPathSuggestionChange,
}: ComposerExtensionOptions): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak,
    UndoRedo,
    Placeholder.configure({ placeholder }),
    ReferenceMention.configure({
      deleteTriggerWithBackspace: true,
      renderText: ({ node }) =>
        serializeReference(
          referenceKindForTrigger(node.attrs.mentionSuggestionChar),
          typeof node.attrs.id === 'string' ? node.attrs.id : '',
        ),
      suggestions: [
        {
          char: REFERENCE_TRIGGERS.skill,
          pluginKey: SUGGESTION_KEYS.skill,
          // Commands only expand at the start of the prompt.
          allow: ({ range }) => range.from === COMPOSER_TEXT_START,
          render: suggestionRenderer('skill', onSuggestionChange),
        },
        {
          char: REFERENCE_TRIGGERS.file,
          pluginKey: SUGGESTION_KEYS.file,
          // `(` lets `(@path)` open the picker; other characters (e.g. emails) do not.
          allowedPrefixes: [' ', '('],
          render: suggestionRenderer('file', onSuggestionChange),
        },
      ],
    }),
    PathMention.configure({
      deleteTriggerWithBackspace: true,
      renderText: ({ node }) => (typeof node.attrs.id === 'string' ? node.attrs.id : ''),
      suggestions: [
        {
          char: PATH_TRIGGER,
          pluginKey: PATH_SUGGESTION_KEY,
          findSuggestionMatch: findPathSuggestionMatch,
          render: pathSuggestionRenderer(onPathSuggestionChange),
        },
      ],
    }),
  ];
}
