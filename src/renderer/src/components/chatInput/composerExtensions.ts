import {
  ReactNodeViewRenderer,
  type Editor,
  type Extensions,
  type JSONContent,
  type Range,
} from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
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
  isPathQueryText,
  parentPath,
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
const ALL_SUGGESTION_KEYS = [...Object.values(SUGGESTION_KEYS), PATH_SUGGESTION_KEY];
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
  for (const key of ALL_SUGGESTION_KEYS) {
    if (key.getState(view.state)?.active) exitSuggestion(view, key);
  }
}

/** Whether any picker is open. */
export function hasActiveSuggestion(state: EditorState): boolean {
  return ALL_SUGGESTION_KEYS.some((key) => key.getState(state)?.active === true);
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
  /** Directory of the folder chip being completed into; `null` for a typed token. */
  baseDir: string | null;
  /** Full path label shown on that folder chip, if any. */
  baseLabel: string | null;
  /** Replace the token (and the folder chip) with a path chip. */
  insert: (entry: PathCompletionEntry) => void;
  /** Go one level up from the folder chip; set only when nothing is typed after it. */
  leaveFolder: (() => void) | null;
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
  const { doc, pos, nodeBefore } = config.$position;

  // Right after a folder chip the picker keeps listing that folder, so the
  // path stays editable until a space commits it.
  if (directoryChipBefore(doc, pos)) return { range: { from: pos, to: pos }, query: '', text: '' };
  if (!nodeBefore?.isText) return null;

  const text = nodeBefore.text ?? '';
  const textStart = pos - text.length;
  if (isPathQueryText(text) && directoryChipBefore(doc, textStart)) {
    return { range: { from: textStart, to: pos }, query: text, text };
  }

  const token = findPathTokenAtEnd(text);
  if (!token) return null;

  const from = textStart + token.startOffset;
  // A leading `/com` belongs to the slash-command picker; `/Users/me` is an
  // absolute path and completes here.
  if (from === COMPOSER_TEXT_START && isLeadingSlashCommand(token.token)) return null;
  // Text glued to a folder chip with a space in it has been committed.
  if (directoryChipBefore(doc, from)) return null;

  return { range: { from, to: pos }, query: token.token, text: token.token };
}

function pathChipContent(path: string, pathKind: 'file' | 'directory', label: string): JSONContent {
  return { type: PATH_REFERENCE_NODE_NAME, attrs: { id: path, pathKind, label } };
}

function pathSuggestionRenderer(
  onPathSuggestionChange: ComposerExtensionOptions['onPathSuggestionChange'],
): SuggestionOptions<unknown, MentionNodeAttrs>['render'] {
  const publish = (editor: Editor, range: Range, query: string): void => {
    const directoryChip = directoryChipBefore(editor.state.doc, range.from);
    // The chip already ends the folder; tolerate a habitual `/` after it.
    const token = directoryChip && query.startsWith(PATH_TRIGGER) ? query.slice(1) : query;
    const baseLabel = directoryChip?.label ?? null;

    const replaceToken = (content: JSONContent[]): void => {
      const target = { from: directoryChip?.from ?? range.from, to: range.to };
      const chain = editor.chain().focus();
      (content.length > 0
        ? chain.insertContentAt(target, content)
        : chain.deleteRange(target)
      ).run();

      // Swapping one folder chip for another keeps the same range and query,
      // and the plugin only notifies when those change. Publish again so the
      // picker lists the new folder.
      const next = PATH_SUGGESTION_KEY.getState(editor.state);
      if (
        next?.active &&
        next.query === query &&
        next.range.from === range.from &&
        next.range.to === range.to
      ) {
        publish(editor, next.range, next.query);
      }
    };

    onPathSuggestionChange({
      token,
      baseDir: directoryChip?.path ?? null,
      baseLabel,
      insert: (entry) => {
        const label = pathCompletionLabel(token, baseLabel, entry.name);
        replaceToken(
          entry.isDirectory
            ? [pathChipContent(entry.path, 'directory', label)]
            : // A file cannot go deeper, so it commits right away.
              [pathChipContent(entry.path, 'file', label), { type: 'text', text: ' ' }],
        );
      },
      leaveFolder:
        directoryChip && query.length === 0
          ? () => {
              const parentLabel = directoryChip.label ? parentPath(directoryChip.label) : null;
              const parentDirectory = parentPath(directoryChip.path);
              replaceToken(
                parentLabel && parentDirectory
                  ? [pathChipContent(parentDirectory, 'directory', parentLabel)]
                  : [],
              );
            }
          : null,
    });
  };
  return () => {
    const publishProps = (props: ReferenceSuggestionProps): void =>
      publish(props.editor, props.range, props.query);
    return {
      onStart: publishProps,
      onUpdate: publishProps,
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

/** The folder chip ending at `position`, if any. */
function directoryChipBefore(doc: ProseMirrorNode, position: number): DirectoryChipContext | null {
  const chip = doc.resolve(position).nodeBefore;
  if (
    chip?.type.name !== PATH_REFERENCE_NODE_NAME ||
    chip.attrs.pathKind !== 'directory' ||
    typeof chip.attrs.id !== 'string'
  ) {
    return null;
  }

  return {
    from: position - chip.nodeSize,
    path: chip.attrs.id,
    label: typeof chip.attrs.label === 'string' && chip.attrs.label ? chip.attrs.label : null,
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
      renderText: ({ node }) => {
        const path = typeof node.attrs.id === 'string' ? node.attrs.id : '';
        // A trailing slash keeps text typed after a folder chip a separate segment.
        return node.attrs.pathKind === 'directory' && !path.endsWith('/') ? `${path}/` : path;
      },
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
