// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';
import FileTreeSidebar from './FileTreeSidebar';
import { SidebarProvider } from '../ui/sidebar';
import type { ProjectFilesChanged } from '../../../../shared/ipcContract';

const originalPiApi = window.piApi;
let changeListener: ((change: ProjectFilesChanged) => void) | null = null;

afterEach(() => {
  cleanup();
  changeListener = null;
  window.piApi = originalPiApi;
});

function renderSidebar(
  listProjectDirectory: typeof window.piApi.listProjectDirectory,
  onActiveFileChanged: () => void = vi.fn(),
  selectedFilePath: string | null = null,
): { watchProjectFiles: ReturnType<typeof vi.fn>; onActiveFileChanged: () => void } {
  const watchProjectFiles = vi.fn();
  window.piApi = {
    ...originalPiApi,
    listProjectDirectory,
    watchProjectFiles,
    onProjectFilesChanged: (callback) => {
      changeListener = callback;
      return () => {
        changeListener = null;
      };
    },
  };
  render(
    <SidebarProvider>
      <FileTreeSidebar
        projectPath="/repo"
        projectName="repo"
        selectedFilePath={selectedFilePath}
        onOpenFile={vi.fn()}
        onOpenSettings={vi.fn()}
        onActiveFileChanged={onActiveFileChanged}
        shortcutBindings={null}
      />
    </SidebarProvider>,
  );
  return { watchProjectFiles, onActiveFileChanged };
}

describe('FileTreeSidebar automatic updates', () => {
  it('reloads the root and shows files created since the first load', async () => {
    const listProjectDirectory = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        entries: [{ name: 'old.txt', path: 'old.txt', isDirectory: false }],
        truncated: false,
      })
      .mockResolvedValueOnce({
        success: true,
        entries: [
          { name: 'old.txt', path: 'old.txt', isDirectory: false },
          { name: 'new.txt', path: 'new.txt', isDirectory: false },
        ],
        truncated: false,
      });

    renderSidebar(listProjectDirectory);
    expect(await screen.findByText('old.txt')).toBeInTheDocument();
    expect(screen.queryByText('new.txt')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh files' })).toBeNull();

    await act(async () => {
      changeListener?.({ cwd: '/repo', directories: [''], filePath: null });
    });

    expect(await screen.findByText('new.txt')).toBeInTheDocument();
    expect(screen.getByText('old.txt')).toBeInTheDocument();
    expect(listProjectDirectory).toHaveBeenCalledTimes(2);
  });

  it('reloads the active file only when the change names it', async () => {
    const listProjectDirectory = vi.fn().mockResolvedValue({
      success: true,
      entries: [],
      truncated: false,
    });

    const { onActiveFileChanged } = renderSidebar(listProjectDirectory, undefined, 'src/app.ts');

    await act(async () => {
      changeListener?.({ cwd: '/repo', directories: [], filePath: 'src/other.ts' });
    });
    expect(onActiveFileChanged).not.toHaveBeenCalled();

    await act(async () => {
      changeListener?.({ cwd: '/repo', directories: [], filePath: 'src/app.ts' });
    });
    expect(onActiveFileChanged).toHaveBeenCalledTimes(1);
  });
});

describe('FileTreeSidebar context menu', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('copies the name and relative path of a file', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const listProjectDirectory = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        entries: [
          { name: 'src', path: 'src', isDirectory: true },
          { name: 'README.md', path: 'README.md', isDirectory: false },
        ],
        truncated: false,
      })
      .mockResolvedValue({
        success: true,
        entries: [{ name: 'app.ts', path: 'src/app.ts', isDirectory: false }],
        truncated: false,
      });

    renderSidebar(listProjectDirectory, undefined, 'src/app.ts');

    fireEvent.contextMenu(await screen.findByText('app.ts'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy Name' }));
    expect(writeText).toHaveBeenLastCalledWith('app.ts');

    fireEvent.contextMenu(screen.getByText('app.ts'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy Relative Path' }));
    expect(writeText).toHaveBeenLastCalledWith('src/app.ts');
  });
});
