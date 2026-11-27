import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ProjectFileResult } from '../../../../shared/ipcContract';
import FilesTab from './FilesTab';
import '../../assets/main.css';

const PROJECT = '/project';

function deferred(): { promise: Promise<ProjectFileResult>; resolve: (content: string) => void } {
  let resolve: (content: string) => void = () => undefined;
  const promise = new Promise<ProjectFileResult>((done) => {
    resolve = (content) => done({ success: true, content, size: content.length, truncated: false });
  });
  return { promise, resolve };
}

function filesTab(filePath: string): React.JSX.Element {
  return (
    <div className="flex h-96 flex-col">
      <FilesTab
        projectPath={PROJECT}
        sessionProjectPath={PROJECT}
        filePath={filePath}
        fileRevision={0}
        lineTarget={null}
        sessionPath={null}
        findFileShortcut={undefined}
        onFindFile={vi.fn()}
        onOpenFile={vi.fn()}
        onStepFileHistory={vi.fn()}
        onOpenProject={vi.fn()}
      />
    </div>
  );
}

function shownViewer(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[data-testid=file-viewer]')].find((viewer) =>
    viewer.checkVisibility({ visibilityProperty: true }),
  );
}

test('keeps the open file on screen until the next one is read and highlighted', async () => {
  const reads = new Map([
    ['a.ts', deferred()],
    ['b.ts', deferred()],
  ]);
  window.piApi.readProjectFile = (_cwd, path) =>
    reads.get(path)?.promise ?? Promise.reject(new Error(path));

  const screen = await render(filesTab('a.ts'));
  reads.get('a.ts')?.resolve('const first = 1;');
  // The first file also waits out the highlighter's cold start.
  await expect
    .poll(() => shownViewer()?.querySelector('[data-source-content] span[style]'), {
      timeout: 5000,
    })
    .not.toBeNull();
  expect(shownViewer()?.textContent).toContain('const first = 1;');

  await screen.rerender(filesTab('b.ts'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(shownViewer()?.textContent).toContain('const first = 1;');

  reads.get('b.ts')?.resolve('const second = 2;');
  await expect.poll(() => shownViewer()?.textContent).toContain('const second = 2;');
  // Drawn highlighted from its first frame on screen, not plain first.
  expect(shownViewer()?.querySelector('[data-source-content] span[style]')).not.toBeNull();
  expect(document.querySelectorAll('[data-testid=file-viewer]')).toHaveLength(1);
});
