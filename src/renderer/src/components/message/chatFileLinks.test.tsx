// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';
import MarkdownMessage from './markdownMessage';
import { UserBubble } from './messageBubbles';
import { ChatFilesContext, type ChatFiles } from './chatFiles';

const EXISTING = new Set(['src/a.ts', '/outside/notes.md']);
const originalPiApi = window.piApi;
const onOpenFile = vi.fn();
let cwd = '';
let testIndex = 0;

beforeEach(() => {
  // A fresh cwd per test: resolved paths are cached for the whole renderer.
  cwd = `/repo-${testIndex++}`;
  window.piApi = {
    ...originalPiApi,
    resolveExistingFiles: (base: string, paths: string[]) =>
      Promise.resolve(
        paths.map((path) =>
          EXISTING.has(path) ? (path.startsWith('/') ? path : `${base}/${path}`) : null,
        ),
      ),
  };
});

afterEach(() => {
  window.piApi = originalPiApi;
  onOpenFile.mockClear();
  cleanup();
});

function renderInChat(element: React.JSX.Element): void {
  const chatFiles: ChatFiles = { cwd, onOpenFile };
  render(<ChatFilesContext.Provider value={chatFiles}>{element}</ChatFilesContext.Provider>);
}

describe('paths in chat markdown', () => {
  it('links prose and inline-code paths that name existing files', async () => {
    renderInChat(<MarkdownMessage text="Edit src/a.ts, see `/outside/notes.md`, not src/b.ts." />);

    fireEvent.click(await screen.findByRole('link', { name: 'src/a.ts' }));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`);

    fireEvent.click(await screen.findByRole('link', { name: '/outside/notes.md' }));
    expect(onOpenFile).toHaveBeenCalledWith('/outside/notes.md');

    expect(screen.queryByRole('link', { name: 'src/b.ts' })).toBeNull();
  });

  it('opens a relative markdown link in the Files tab', async () => {
    renderInChat(<MarkdownMessage text="[the file](src/a.ts)" />);

    // A plain link until the file is known to exist; the title is the resolved path.
    fireEvent.click(await screen.findByTitle(`${cwd}/src/a.ts`));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`);
  });

  it('leaves a message that is still arriving alone', async () => {
    renderInChat(<MarkdownMessage text="Edit src/a.ts" isStreaming />);

    await Promise.resolve();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('paths in a sent message', () => {
  it('draws @ references and paths as chips that open existing files', async () => {
    renderInChat(
      <UserBubble
        node={{ id: 'u', role: 'user', text: 'read @src/a.ts and @missing.ts', sentAt: 0 }}
        searchQuery=""
        activeOccurrenceIndex={null}
      />,
    );

    expect(screen.getByTitle('missing.ts')).toHaveTextContent('missing.ts');
    fireEvent.click(await screen.findByRole('button', { name: 'a.ts' }));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`);
    expect(screen.queryByRole('button', { name: 'missing.ts' })).toBeNull();
  });
});
