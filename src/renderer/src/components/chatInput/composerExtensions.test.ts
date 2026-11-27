// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import '../../testing/jsdomSetup';
import { createComposerExtensions, insertDirectoryChip } from './composerExtensions';

function createEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: createComposerExtensions({
      placeholder: '',
      onSuggestionChange: () => {},
      onPathSuggestionChange: () => {},
    }),
    content: '',
  });
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
