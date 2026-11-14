// @vitest-environment jsdom
import '../../testing/jsdomSetup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GitDiffFile, GitDiffSource } from '../../../../shared/ipcContract';
import { useAppStore } from '../../state/appStore';
import GitDiffViewer from './GitDiffViewer';

// The header is what is under test; the diff itself never needs to load.
vi.mock('../../services/piAgentClient', () => ({
  getGitDiffFile: () => new Promise(() => {}),
}));

const FILE: GitDiffFile = {
  path: 'src/app.ts',
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
};

function viewer(
  sessionPath: string,
  source: GitDiffSource,
  projectPath = '/repo',
  sessionProjectPath = '/repo',
): React.JSX.Element {
  return (
    <GitDiffViewer
      projectPath={projectPath}
      sessionProjectPath={sessionProjectPath}
      source={source}
      compareLabel="main"
      baseLabel="origin/main"
      branch="main"
      file={FILE}
      layout="unified"
      onLayoutChange={vi.fn()}
      sessionPath={sessionPath}
    />
  );
}

describe('GitDiffViewer file comment', () => {
  beforeEach(() => {
    useAppStore.setState({ quotesBySession: new Map() });
  });

  afterEach(() => {
    cleanup();
  });

  it('quotes the whole file under its diff scope', () => {
    render(viewer('/s/one.jsonl', { kind: 'base', base: 'origin/main' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment on file' }));
    const editor = screen.getByRole('textbox', { name: 'Quote comment' });
    fireEvent.change(editor, { target: { value: 'Split this up.' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(useAppStore.getState().quotesBySession.get('/s/one.jsonl')).toEqual([
      expect.objectContaining({
        reference: '@src/app.ts, diff against origin/main',
        text: '',
        comment: 'Split this up.',
      }),
    ]);
    expect(screen.queryByRole('textbox', { name: 'Quote comment' })).toBeNull();
    cleanup();
    expect(useAppStore.getState().quotesBySession.get('/s/one.jsonl')).toHaveLength(1);
  });

  it('quotes another project with an absolute path, so the session can still open it', () => {
    render(viewer('/s/one.jsonl', { kind: 'base', base: 'main' }, '/other/repo', '/repo'));
    fireEvent.click(screen.getByRole('button', { name: 'Comment on file' }));
    const editor = screen.getByRole('textbox', { name: 'Quote comment' });
    fireEvent.change(editor, { target: { value: 'Move this helper.' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(useAppStore.getState().quotesBySession.get('/s/one.jsonl')).toEqual([
      expect.objectContaining({
        reference: '@/other/repo/src/app.ts, diff against origin/main',
        comment: 'Move this helper.',
      }),
    ]);
  });

  it('keeps a typed comment open on a press outside, and closes an empty one', () => {
    render(viewer('/s/one.jsonl', { kind: 'unstaged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment on file' }));
    const editor = screen.getByRole('textbox', { name: 'Quote comment' });
    fireEvent.change(editor, { target: { value: 'Not done yet' } });
    fireEvent.pointerDown(document.body);

    expect(screen.getByRole('textbox', { name: 'Quote comment' })).toHaveValue('Not done yet');
    expect(useAppStore.getState().quotesBySession.get('/s/one.jsonl')).toBeUndefined();

    fireEvent.change(editor, { target: { value: '' } });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('textbox', { name: 'Quote comment' })).toBeNull();
  });

  it('closes an editor left open on Escape in its view, before it reaches the window', () => {
    const windowEscape = vi.fn();
    window.addEventListener('keydown', windowEscape);
    render(viewer('/s/one.jsonl', { kind: 'unstaged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment on file' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Quote comment' }), {
      target: { value: 'Not done yet' },
    });
    const diff = screen.getByTestId('git-diff-viewer');
    fireEvent.pointerDown(diff);
    // A menu or dialog elsewhere keeps its Escape.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('textbox', { name: 'Quote comment' })).toBeInTheDocument();
    expect(windowEscape).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(diff, { key: 'Escape' });
    window.removeEventListener('keydown', windowEscape);
    expect(screen.queryByRole('textbox', { name: 'Quote comment' })).toBeNull();
    expect(windowEscape).toHaveBeenCalledTimes(1);
  });

  it('saves a typed comment to the session it was written for when the session changes', () => {
    const { rerender } = render(viewer('/s/one.jsonl', { kind: 'unstaged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment on file' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Quote comment' }), {
      target: { value: 'Not done yet' },
    });
    rerender(viewer('/s/two.jsonl', { kind: 'unstaged' }));

    expect(screen.queryByRole('textbox', { name: 'Quote comment' })).toBeNull();
    expect(useAppStore.getState().quotesBySession.get('/s/one.jsonl')).toEqual([
      expect.objectContaining({
        reference: '@src/app.ts, unstaged diff',
        comment: 'Not done yet',
      }),
    ]);
    expect(useAppStore.getState().quotesBySession.get('/s/two.jsonl')).toBeUndefined();
  });

  it('closes the editor when the session or diff changes under it', () => {
    const { rerender } = render(viewer('/s/one.jsonl', { kind: 'unstaged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment on file' }));
    expect(screen.getByRole('textbox', { name: 'Quote comment' })).toBeInTheDocument();

    rerender(viewer('/s/two.jsonl', { kind: 'unstaged' }));
    expect(screen.queryByRole('textbox', { name: 'Quote comment' })).toBeNull();

    rerender(viewer('/s/one.jsonl', { kind: 'unstaged' }));
    expect(screen.queryByRole('textbox', { name: 'Quote comment' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Comment on file' }));
    rerender(viewer('/s/one.jsonl', { kind: 'staged' }));
    expect(screen.queryByRole('textbox', { name: 'Quote comment' })).toBeNull();
  });
});
