// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import '../../testing/jsdomSetup';
import {
  composerLineBounds,
  createComposerExtensions,
  hasActiveSuggestion,
  insertDirectoryChip,
  lineEdgeForKey,
  moveCaretToLineEdge,
  replaceComposerText,
} from './composerExtensions';

function docWithLines(...lines: string[]): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: lines.flatMap((line, index) => [
          ...(index > 0 ? [{ type: 'hardBreak' }] : []),
          ...(line.length > 0 ? [{ type: 'text', text: line }] : []),
        ]),
      },
    ],
  };
}

function createEditor(content: JSONContent | '' = ''): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: createComposerExtensions({
      placeholder: '',
      onSuggestionChange: () => {},
      onPathSuggestionChange: () => {},
    }),
    content,
  });
}

const NO_COMMANDS: ReadonlySet<string> = new Set();

function composerText(editor: Editor): string {
  const { doc } = editor.state;
  return doc.textBetween(0, doc.content.size, '\n', '\n');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('insertDirectoryChip', () => {
  it('inserts a directory chip that serializes to the full path', () => {
    const editor = createEditor();
    insertDirectoryChip(editor, '/work/alpha');

    expect(editor.getText()).toBe('/work/alpha/ ');
    editor.destroy();
  });
});

describe('composerLineBounds', () => {
  it('bounds the line around the caret between hard breaks', () => {
    const editor = createEditor(docWithLines('one', 'two', 'three'));
    const { doc } = editor.state;

    expect(composerLineBounds(doc, 2)).toEqual({ from: 1, to: 4 });
    expect(composerLineBounds(doc, 4)).toEqual({ from: 1, to: 4 });
    expect(composerLineBounds(doc, 5)).toEqual({ from: 5, to: 8 });
    expect(composerLineBounds(doc, 9)).toEqual({ from: 9, to: 14 });
    editor.destroy();
  });

  it('bounds an empty line between two hard breaks to that line', () => {
    const editor = createEditor(docWithLines('one', '', 'two'));
    const { doc } = editor.state;

    expect(composerLineBounds(doc, 5)).toEqual({ from: 5, to: 5 });
    expect(composerLineBounds(doc, 6)).toEqual({ from: 6, to: 9 });
    editor.destroy();
  });

  it('bounds an empty paragraph to its caret position', () => {
    const editor = createEditor();

    expect(composerLineBounds(editor.state.doc, 1)).toEqual({ from: 1, to: 1 });
    editor.destroy();
  });

  it('counts an inline chip as one position', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: '/work/alpha', mentionSuggestionChar: '@' } },
            { type: 'hardBreak' },
            { type: 'text', text: 'two' },
          ],
        },
      ],
    });
    const { doc } = editor.state;

    expect(composerLineBounds(doc, 2)).toEqual({ from: 1, to: 2 });
    expect(composerLineBounds(doc, 3)).toEqual({ from: 3, to: 6 });
    editor.destroy();
  });
});

describe('moveCaretToLineEdge', () => {
  it('moves to the edge of the current line, not the whole composer', () => {
    const editor = createEditor(docWithLines('one', 'two'));
    editor.commands.setTextSelection(6);

    moveCaretToLineEdge(editor, 'start');
    expect(editor.state.selection.from).toBe(5);
    moveCaretToLineEdge(editor, 'end');
    expect(editor.state.selection.from).toBe(8);
    editor.destroy();
  });

  it('collapses a selection to the line edge at the head', () => {
    const editor = createEditor(docWithLines('one', 'two'));
    editor.commands.setTextSelection({ from: 2, to: 6 });

    moveCaretToLineEdge(editor, 'start');
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(5);
    editor.destroy();
  });

  it('collapses a select-all to the last line end', () => {
    const editor = createEditor(docWithLines('one', 'two'));
    editor.commands.selectAll();

    moveCaretToLineEdge(editor, 'end');
    expect(editor.state.selection.from).toBe(8);
    editor.destroy();
  });

  it('extends the selection to the line edge instead of collapsing it', () => {
    const editor = createEditor(docWithLines('one', 'two'));
    editor.commands.setTextSelection(2);

    moveCaretToLineEdge(editor, 'end', true);
    expect(editor.state.selection.anchor).toBe(2);
    expect(editor.state.selection.head).toBe(4);

    moveCaretToLineEdge(editor, 'start', true);
    expect(editor.state.selection.anchor).toBe(2);
    expect(editor.state.selection.head).toBe(1);
    editor.destroy();
  });
});

describe('lineEdgeForKey', () => {
  const key = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init);

  it('maps the macOS line and paragraph motions to line edges', () => {
    expect(lineEdgeForKey(key({ key: 'a', ctrlKey: true }))).toBe('start');
    expect(lineEdgeForKey(key({ key: 'E', ctrlKey: true }))).toBe('end');
    expect(lineEdgeForKey(key({ key: 'a', ctrlKey: true, shiftKey: true }))).toBe('start');
    expect(lineEdgeForKey(key({ key: 'ArrowLeft', metaKey: true }))).toBe('start');
    expect(lineEdgeForKey(key({ key: 'ArrowRight', metaKey: true, shiftKey: true }))).toBe('end');
    expect(lineEdgeForKey(key({ key: 'ArrowUp', altKey: true }))).toBe('start');
    expect(lineEdgeForKey(key({ key: 'ArrowDown', altKey: true }))).toBe('end');
  });

  it('leaves every other caret motion alone', () => {
    expect(lineEdgeForKey(key({ key: 'a' }))).toBeNull();
    expect(lineEdgeForKey(key({ key: 'a', metaKey: true }))).toBeNull();
    expect(lineEdgeForKey(key({ key: 'ArrowLeft' }))).toBeNull();
    expect(lineEdgeForKey(key({ key: 'ArrowLeft', altKey: true }))).toBeNull();
    expect(lineEdgeForKey(key({ key: 'ArrowUp', metaKey: true }))).toBeNull();
    expect(lineEdgeForKey(key({ key: 'a', ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe('replaceComposerText', () => {
  it('puts the caret on the first line when recalling with ArrowUp', () => {
    const editor = createEditor();
    replaceComposerText(editor, 'one\ntwo', NO_COMMANDS, 'start');

    expect(composerText(editor)).toBe('one\ntwo');
    expect(editor.state.selection.from).toBe(1);

    // The old caret already sits at the start: setContent still leaves the
    // selection at the end, so a second recall must put it back on line one.
    replaceComposerText(editor, 'three\nfour', NO_COMMANDS, 'start');
    expect(editor.state.selection.from).toBe(1);
    editor.destroy();
  });

  it('puts the caret on the last line when moving down the history', () => {
    const editor = createEditor();
    replaceComposerText(editor, 'one\ntwo', NO_COMMANDS, 'end');

    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);
    editor.destroy();
  });

  it('leaves an empty composer with its caret in the first line', () => {
    const editor = createEditor();
    replaceComposerText(editor, '', NO_COMMANDS, 'end');

    expect(editor.state.selection.from).toBe(1);
    editor.destroy();
  });

  it('parses chips and closes the picker their text would open', () => {
    const editor = createEditor();
    replaceComposerText(editor, '/compact x\ny', new Set(['compact']), 'start');

    expect(editor.getText()).toBe('/compact x\ny');
    expect(editor.state.doc.firstChild?.firstChild?.type.name).toBe('mention');
    expect(editor.state.selection.from).toBe(1);
    expect(hasActiveSuggestion(editor.state)).toBe(false);
    editor.destroy();
  });
});
