// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';
import MarkdownMessage from './markdownMessage';
import { localFileUrl } from '../../lib/chatAttachments';

const openExternal = vi.fn();
const originalPiApi = window.piApi;

beforeEach(() => {
  window.piApi = { ...originalPiApi, openExternal };
  projectFile.onOpenFile.mockClear();
});

afterEach(() => {
  window.piApi = originalPiApi;
  openExternal.mockClear();
  cleanup();
});

const projectFile = {
  projectPath: '/repo',
  filePath: 'docs/guide.md',
  onOpenFile: vi.fn(),
};

describe('MarkdownMessage project files', () => {
  it('opens a relative link through the Files viewer', () => {
    render(<MarkdownMessage text="[Other](other.md)" projectFile={projectFile} />);

    fireEvent.click(screen.getByRole('link', { name: 'Other' }));

    expect(projectFile.onOpenFile).toHaveBeenCalledWith('docs/other.md');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('loads a relative image through the local-file protocol', () => {
    render(<MarkdownMessage text="![Dot](images/dot.png)" projectFile={projectFile} />);

    const image = screen.getByRole('img', { name: 'Dot' });
    expect(image).toHaveAttribute('src', localFileUrl('/repo/docs/images/dot.png'));
    expect(image).not.toHaveAttribute('node');
  });

  it('leaves an image inside a link to the link, without a zoom overlay', () => {
    const { container } = render(
      <MarkdownMessage text="[![Badge](badge.svg)](https://example.com) ![Dot](dot.png)" />,
    );

    expect(container.querySelector('a [data-rmiz]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Dot' }).closest('[data-rmiz]')).not.toBeNull();

    fireEvent.click(screen.getByRole('img', { name: 'Badge' }));
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('does not send an in-page anchor to the system browser', () => {
    render(<MarkdownMessage text="[Section](#section)" projectFile={projectFile} />);

    fireEvent.click(screen.getByRole('link', { name: 'Section' }));

    expect(openExternal).not.toHaveBeenCalled();
    expect(projectFile.onOpenFile).not.toHaveBeenCalled();
  });

  it('still sends external links to the system browser', () => {
    render(<MarkdownMessage text="[Docs](https://example.com/docs)" projectFile={projectFile} />);

    fireEvent.click(screen.getByRole('link', { name: 'Docs' }));

    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
    expect(projectFile.onOpenFile).not.toHaveBeenCalled();
  });
});
