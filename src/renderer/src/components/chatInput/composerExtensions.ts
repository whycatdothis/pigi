import { ReactNodeViewRenderer, type Extensions, type Range } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { PluginKey } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
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
import {
  findPathTokenAtEnd,
  isLeadingSlashCommand,
  pathCompletionLabel,
} from '../../lib/pathReferences';
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

/** Close the path picker if it is open. */
export function exitPathSuggestion(view: EditorView): void {
  if (PATH_SUGGESTION_KEY.getState(view.state)?.active) exitSuggestion(view, PATH_SUGGESTION_KEY);
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
  /** Token to complete, relative to `baseDir` or the project directory. */
  token: string;
  /** Directory from a preceding folder chip; `null` for a project-relative token. */
  baseDir: string | null;
  /** Full path label shown on a preceding folder chip, if any. */
  baseLabel: string | null;
  /** Document position where replacement starts, including a preceding folder chip. */
  replaceFrom: number;
  /** Replace the token (and a preceding folder chip) with a path chip. */
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
  const range = { from, to: config.$position.pos };
  const directoryChip = directoryChipBefore(config.$position.doc, range);

  // A leading `/com` belongs to the slash-command picker; `/Users/me` is an
  // absolute path and completes here.
  if (from === COMPOSER_TEXT_START && isLeadingSlashCommand(token.token)) return null;
  // After a folder chip the `/` inserted with the chip is the separator. A
  // bare token would be glued to the chip path in the prompt text.
  if (directoryChip && !token.token.startsWith(PATH_TRIGGER)) return null;

  return {
    range,
    query: token.token,
    text: token.token,
  };
}

function pathSuggestionRenderer(
  onPathSuggestionChange: ComposerExtensionOptions['onPathSuggestionChange'],
): SuggestionOptions<unknown, MentionNodeAttrs>['render'] {
  return () => {
    const publish = (props: ReferenceSuggestionProps): void => {
      const directoryChip = directoryChipBefore(props.editor.state.doc, props.range);
      const token =
        directoryChip && props.query.startsWith(PATH_TRIGGER)
          ? props.query.slice(PATH_TRIGGER.length)
          : props.query;
      const baseLabel = directoryChip?.label ?? null;
      const replaceFrom = directoryChip?.from ?? props.range.from;
      onPathSuggestionChange({
        token,
        baseDir: directoryChip?.path ?? null,
        baseLabel,
        replaceFrom,
        insert: (entry) => {
          const label = pathCompletionLabel(token, baseLabel, entry.name);
          const content = entry.isDirectory
            ? [
                {
                  type: PATH_REFERENCE_NODE_NAME,
                  attrs: { id: entry.path, pathKind: 'directory', label },
                },
                // Keep the slash so typing the next segment reads as one path.
                { type: 'text', text: PATH_TRIGGER },
              ]
            : [
                {
                  type: PATH_REFERENCE_NODE_NAME,
                  attrs: { id: entry.path, pathKind: 'file', label },
                },
                { type: 'text', text: ' ' },
              ];
          props.editor
            .chain()
            .focus()
            .insertContentAt({ from: replaceFrom, to: props.range.to }, content)
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

interface DirectoryChipContext {
  /** Document position where the folder chip starts. */
  from: number;
  /** Absolute directory stored on the chip. */
  path: string;
  /** Full path shown on the chip, if it was created by path completion. */
  label: string | null;
}

/** The folder chip immediately before a completion token, if any. */
function directoryChipBefore(doc: ProseMirrorNode, range: Range): DirectoryChipContext | null {
  const $to = doc.resolve(range.to);
  const tokenNode = $to.nodeBefore;
  if (!tokenNode?.isText) return null;

  const textStart = range.to - tokenNode.nodeSize;
  // A token after a space starts a new path, not a continuation of the chip.
  if (range.from !== textStart) return null;

  const preceding = doc.resolve(textStart).nodeBefore;
  if (
    preceding?.type.name !== PATH_REFERENCE_NODE_NAME ||
    preceding.attrs.pathKind !== 'directory' ||
    typeof preceding.attrs.id !== 'string'
  ) {
    return null;
  }

  return {
    from: textStart - preceding.nodeSize,
    path: preceding.attrs.id,
    label: typeof preceding.attrs.label === 'string' ? preceding.attrs.label : null,
  };
}

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
      label: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-path-label') ?? '',
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.label === 'string' && attributes.label.length > 0
            ? { 'data-path-label': attributes.label }
            : {},
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
