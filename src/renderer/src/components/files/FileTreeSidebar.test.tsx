// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';
import FileTreeSidebar from './FileTreeSidebar';
import { SidebarProvider } from '../ui/sidebar';

const originalPiApi = window.piApi;

afterEach(() => {
  window.piApi = originalPiApi;
  cleanup();
});

function renderSidebar(listProjectDirectory: typeof window.piApi.listProjectDirectory): void {
  window.piApi = { ...originalPiApi, listProjectDirectory };
  render(
    <SidebarProvider>
      <FileTreeSidebar
        projectPath="/repo"
        projectName="repo"
        selectedFilePath={null}
        onOpenFile={vi.fn()}
        onFindFile={vi.fn()}
        onOpenSettings={vi.fn()}
        shortcutBindings={null}
      />
    </SidebarProvider>,
  );
}

describe('FileTreeSidebar refresh', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Refresh files' }));

    expect(await screen.findByText('new.txt')).toBeInTheDocument();
    expect(screen.getByText('old.txt')).toBeInTheDocument();
    expect(listProjectDirectory).toHaveBeenCalledTimes(2);
  });
});
