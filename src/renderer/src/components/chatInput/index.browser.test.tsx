import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Editor } from '@tiptap/core';
import ChatInput from './index';
import '../../assets/main.css';

type ComposerElement = HTMLElement & { editor?: Editor };

const noop = (): void => {};

/** The layout the Add-directory button floats over: two lines of one paragraph. */
const TWO_LINES = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'first line' },
        { type: 'hardBreak' },
        { type: 'text', text: 'second line' },
      ],
    },
  ],
};

async function mountComposer(): Promise<HTMLElement> {
  const screen = await render(
    <ChatInput
      onSend={noop}
      onFollowUp={noop}
      onAbort={noop}
      onSlashCommand={noop}
      isStreaming={false}
      gitBranch={null}
      gitCwd=""
      restoreInputs={null}
      onRestoredInputs={noop}
      onRefreshGitBranch={async () => {}}
      session={null}
      modelOptions={[]}
      thinkingLevelOptions={[]}
      skillOptions={[]}
      userHistory={[]}
      onSelectModel={noop}
      onSelectThinkingLevel={noop}
      onRequestModelRefresh={noop}
      workdirPicker={{ taskDirs: ['/work/alpha'], historyDirs: [], projects: [] }}
    />,
  );

  const composer = screen.container.querySelector<ComposerElement>('[data-testid=chat-composer]');
  if (!composer) throw new Error('no composer is on the page');
  await expect.poll(() => Boolean(composer.editor)).toBe(true);

  composer.editor?.commands.setContent(TWO_LINES);
  return screen.container;
}

/** Left edge of the line whose text is `text`. */
function lineLeft(container: HTMLElement, text: string): number {
  const composer = container.querySelector('[data-testid=chat-composer]');
  if (!composer) throw new Error('no composer is on the page');
  const walker = document.createTreeWalker(composer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent !== text) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().left;
  }
  throw new Error(`no line reads "${text}"`);
}

test('only the first line clears the Add-directory button', async () => {
  const container = await mountComposer();
  const button = container.querySelector('button[aria-label="Add directory"]');
  if (!button) throw new Error('no Add-directory button is on the page');
  const buttonBox = button.getBoundingClientRect();

  expect(lineLeft(container, 'first line')).toBeGreaterThan(buttonBox.right);
  // A hard break ends the float's line: the second line starts at the
  // composer's left edge, i.e. under the button, not beside it.
  expect(lineLeft(container, 'second line')).toBeCloseTo(buttonBox.left, 0);

  // The editor's box covers the float's area; the button must still win the
  // hit test or the picker cannot be opened.
  const overButton = document.elementFromPoint(
    buttonBox.left + buttonBox.width / 2,
    buttonBox.top + buttonBox.height / 2,
  );
  expect(overButton).toBe(button);
});
