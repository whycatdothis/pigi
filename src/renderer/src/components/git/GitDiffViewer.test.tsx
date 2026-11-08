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

function viewer(sessionPath: string, source: GitDiffSource): React.JSX.Element {
  return (
    <GitDiffViewer
      projectPath="/repo"
      source={source}
      compareLabel="main"
      baseLabel="origin/main"
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
