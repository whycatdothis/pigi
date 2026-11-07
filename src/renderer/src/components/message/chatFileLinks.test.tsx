// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';
import MarkdownMessage from './markdownMessage';
import { UserBubble } from './messageBubbles';
import { ChatFilesContext, type ChatFiles } from './chatFiles';

const EXISTING = new Set(['src/a.ts', '/outside/notes.md']);
const DIRECTORIES = new Set(['/data/notes/']);
const originalPiApi = window.piApi;
const onOpenFile = vi.fn();
let cwd = '';
let testIndex = 0;

beforeEach(() => {
  // A fresh cwd per test: resolved paths are cached for the whole renderer.
  cwd = `/repo-${testIndex++}`;
  window.piApi = {
    ...originalPiApi,
    resolveExistingPaths: (base: string, paths: string[]) =>
      Promise.resolve(
        paths.map((path) =>
          EXISTING.has(path) || DIRECTORIES.has(path)
            ? {
                path: path.startsWith('/') ? path : `${base}/${path}`,
                isDirectory: DIRECTORIES.has(path),
              }
            : null,
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
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`, null);

    // The chip replaces the code box, as it replaces the plain text.
    const codeLink = await screen.findByRole('link', { name: '/outside/notes.md' });
    expect(codeLink.querySelector('img')).not.toBeNull();
    expect(codeLink.querySelector('code')).toBeNull();
    fireEvent.click(codeLink);
    expect(onOpenFile).toHaveBeenCalledWith('/outside/notes.md', null);

    expect(screen.queryByRole('link', { name: 'src/b.ts' })).toBeNull();
  });

  it('opens a path at the lines its suffix names', async () => {
    renderInChat(<MarkdownMessage text="See src/a.ts:55-56 and `src/a.ts:7`." />);

    fireEvent.click(await screen.findByRole('link', { name: 'src/a.ts:55-56' }));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`, { start: 55, end: 56 });
    fireEvent.click(await screen.findByRole('link', { name: 'src/a.ts:7' }));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`, { start: 7, end: 7 });
  });

  it('opens a relative markdown link in the Files tab', async () => {
    renderInChat(<MarkdownMessage text="[the file](src/a.ts)" />);

    // A plain link until the file is known to exist; the title is the resolved path.
    fireEvent.click(await screen.findByTitle(`${cwd}/src/a.ts`));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`, null);
  });

  it('leaves a message that is still arriving alone', async () => {
    renderInChat(<MarkdownMessage text="Edit src/a.ts" isStreaming />);

    await Promise.resolve();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

function renderSent(text: string, searchQuery = ''): void {
  renderInChat(
    <UserBubble
      node={{ id: 'u', role: 'user', text, sentAt: 0 }}
      searchQuery={searchQuery}
      activeOccurrenceIndex={null}
    />,
  );
}

describe('paths in a sent message', () => {
  it('draws existing files as chips that open them, and folders as plain chips', async () => {
    renderSent('read @src/a.ts in /data/notes/');

    fireEvent.click(await screen.findByRole('button', { name: 'a.ts' }));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`, null);
    expect(await screen.findByTitle('/data/notes/')).toHaveTextContent('/data/notes/');
  });

  it('keeps a quote line range in the chip and opens the file at it', async () => {
    renderSent('look at @src/a.ts:55-56, please');

    fireEvent.click(await screen.findByRole('button', { name: 'a.ts:55-56' }));
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/src/a.ts`, { start: 55, end: 56 });
  });

  it('leaves what names nothing on disk as text', async () => {
    renderSent('GET /api/users/1 or @missing.ts, then @src/a.ts');

    // Every lookup goes out in one batch, so the one chip marks them all answered.
    await screen.findByRole('button', { name: 'a.ts' });
    expect(screen.queryByTitle('/api/users/1')).toBeNull();
    expect(screen.queryByTitle('missing.ts')).toBeNull();
    expect(screen.queryByRole('button', { name: /api|missing/ })).toBeNull();
  });

  it('shows a chip holding a search match as its text, highlighted', async () => {
    renderSent('read @src/a.ts', 'src');

    expect(screen.getByText('src').tagName).toBe('MARK');
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'a.ts' })).toBeNull();
  });
});
