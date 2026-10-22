// @vitest-environment jsdom
import { installViewport } from '../../testing/jsdomSetup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionTree } from '../../../../shared/ipcContract';
import { installFakePiApi, type FakePiApi } from '../../testing/fakePiApi';
import { sessionTree, sessionTreeEntry } from '../../testing/sessionTreeFixtures';
import SessionTreeDialog from './SessionTreeDialog';

const SESSION_PATH = '/tmp/sessions/2026-01-02_01.jsonl';

/**
 * A session with everything the dialog has to place: a plain chain, a fork with a
 * compaction under one side, and a second tree the session left behind (its leaf is
 * in the first one).
 *
 *   u1 ─ a1 ─ t1 ─ u2 ─┬─ a2 ─ c1
 *                      └─ a3 (current)
 *   h2 ─ b1
 */
function dialogTree(): SessionTree {
  return sessionTree(
    [
      sessionTreeEntry(0, 'u1', null, 'user', 'Start the refactor'),
      sessionTreeEntry(1, 'a1', 'u1', 'assistant', 'Here is the plan'),
      sessionTreeEntry(2, 't1', 'a1', 'toolResult', 'hi', {
        preview: '$ echo hi · hi',
        toolName: 'bash',
        toolArgs: { command: 'echo hi' },
        toolCallId: 'call-1',
      }),
      sessionTreeEntry(3, 'u2', 't1', 'user', 'Run it now'),
      sessionTreeEntry(4, 'a2', 'u2', 'assistant', 'First attempt'),
      sessionTreeEntry(5, 'c1', 'a2', 'compaction', 'Compacted 12k tokens', {
        tokensBefore: 12000,
      }),
      sessionTreeEntry(6, 'a3', 'u2', 'assistant', 'Second attempt'),
      sessionTreeEntry(7, 'h2', null, 'user', 'A second tree'),
      sessionTreeEntry(8, 'b1', 'h2', 'branchSummary', 'Summarized the abandoned branch'),
    ],
    'a3',
  );
}

let fake: FakePiApi;

/** The same session without the second tree: the cursor keys see only its rows. */
function singleTreeSession(): SessionTree {
  const { entries } = dialogTree();
  return sessionTree(
    entries.filter((entry) => entry.id !== 'h2' && entry.id !== 'b1'),
    'a3',
  );
}

beforeEach(() => {
  // The list draws only the rows its viewport holds, and jsdom has no layout to
  // measure: without a size it would draw none, and every test here would pass by
  // reading nothing. A viewport tall enough for a whole fixture keeps these tests
  // about what a row does; the window itself is measured in the browser layer.
  installViewport({ width: 880, height: 2000 });
  fake = installFakePiApi(dialogTree());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface DialogProps {
  onSelect: (entryId: string) => void;
  onOpenChange: (open: boolean) => void;
  revision?: string;
}

/** Mount the dialog and wait for the tree read behind it to land. */
async function renderDialog({
  onSelect,
  onOpenChange,
  revision = '1',
}: DialogProps): Promise<void> {
  render(
    <SessionTreeDialog
      open
      onOpenChange={onOpenChange}
      sessionPath={SESSION_PATH}
      revision={revision}
      onSelect={onSelect}
    />,
  );
  await screen.findAllByTestId('session-tree-row');
}

const rows = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-testid=session-tree-row]'));

/** The entry ids on screen, in the order they are drawn. */
const rowIds = (): (string | undefined)[] => rows().map((row) => row.dataset.treeRowId);

function row(entryId: string): HTMLElement {
  const found = rows().find((candidate) => candidate.dataset.treeRowId === entryId);
  if (!found) throw new Error(`no row for ${entryId}; on screen: ${rowIds().join(', ')}`);
  return found;
}

/** The row the keyboard is on, as the list paints it. */
const selectedRowId = (): string | null =>
  rows().find((candidate) => candidate.dataset.treeSelected === 'true')?.dataset.treeRowId ?? null;

describe('SessionTreeDialog', () => {
  it('draws the current tree and leaves the ones the session left folded', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });

    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3']);
    // The header of the tree the leaf is not in stays, so the version is not lost.
    // Asked for as the button they are: the pinned band draws the same line as a
    // copy, and the copy is not the control.
    expect(screen.getByRole('button', { name: /^Tree 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tree 2/ })).toBeInTheDocument();
    expect(screen.getByText('2 trees · 9 messages')).toBeInTheDocument();
  });

  it('opens a lone tree when the session is back before the first message', async () => {
    // A single tree has no header to unfold it with.
    fake = installFakePiApi(sessionTree(singleTreeSession().entries, null));
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });

    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3']);
  });

  it('opens the newest tree when the session is back before the first message', async () => {
    fake = installFakePiApi(sessionTree(dialogTree().entries, null));
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });

    expect(rowIds()).toEqual(['h2', 'b1']);
    expect(screen.getByRole('button', { name: /^Tree 1/ })).toBeInTheDocument();
  });

  it('folds a tree from the header the pinned band draws', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    // The band holds the header of the tree the top rows belong to. Clicking it is
    // the same gesture as clicking the header itself, which may have scrolled away.
    await user.click(screen.getByTestId('session-tree-pinned-header'));

    // One click folds the tree away, which the header it leaves behind reports.
    await waitFor(() => expect(rowIds()).toEqual([]));
    expect(screen.getByRole('button', { name: /^Tree 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tree 2/ })).toBeInTheDocument();

    // And the click on the header itself is the way back, folds and all.
    await user.click(screen.getByRole('button', { name: /^Tree 1/ }));
    await waitFor(() => expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3']));
  });

  it('marks the row the session sits on', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });

    expect(row('a3')).toHaveTextContent('Current');
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('indents the children of a fork and keeps a lone chain at one level', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });

    expect(row('u1')).toHaveAttribute('aria-level', '1');
    expect(row('a1')).toHaveAttribute('aria-level', '1');
    expect(row('t1')).toHaveAttribute('aria-level', '1');
    expect(row('u2')).toHaveAttribute('aria-level', '1');
    expect(row('a2')).toHaveAttribute('aria-level', '2');
    expect(row('c1')).toHaveAttribute('aria-level', '2');
    expect(row('a3')).toHaveAttribute('aria-level', '2');
  });

  it('shows a tool row as its command', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });

    expect(row('t1')).toHaveTextContent('$ echo hi · hi');
  });

  it('narrows the list to the matches and the ancestors that carry them', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Search this session'), 'echo');

    expect(rowIds()).toEqual(['u1', 'a1', 't1']);
    expect(screen.getByText('3 of 9 messages')).toBeInTheDocument();
  });

  it('filters by kind, and opens every tree while a filter is on', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Summaries' }));

    expect(screen.getByRole('button', { name: 'Summaries' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // A kind filter drops the rows in between rather than keeping them as context: the
    // branch summary sits in the tree that was folded until now, and its header is
    // still there to say which version it belongs to.
    expect(rowIds()).toEqual(['c1', 'b1']);
    expect(screen.getByText('2 of 9 messages')).toBeInTheDocument();
  });

  it('clears the search on the first Escape and closes on the second', async () => {
    const onOpenChange = vi.fn();
    await renderDialog({ onSelect: vi.fn(), onOpenChange });
    const user = userEvent.setup();
    const search = screen.getByPlaceholderText('Search this session');

    await user.type(search, 'echo');
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves the session to the first match on Enter', async () => {
    const onSelect = vi.fn();
    await renderDialog({ onSelect, onOpenChange: vi.fn() });
    const user = userEvent.setup();

    // `plan` matches `a1` alone, and the first row on screen is its ancestor `u1`:
    // Enter has to take the match, not the ancestor that carries it.
    await user.type(screen.getByPlaceholderText('Search this session'), 'plan{Enter}');

    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('puts the keyboard on the first match and moves it with the arrow keys', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();
    const search = screen.getByPlaceholderText('Search this session');

    // `attempt` matches `a2` (the first of the two), and the rows above it are the
    // ancestors that carry it: the highlight lands on the match, not on the top row.
    await user.type(search, 'attempt');
    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3']);
    expect(selectedRowId()).toBe('a2');

    // The caret stays in the search box: the highlight moves under it, through every
    // row on screen, not only the matches.
    await user.keyboard('{ArrowUp}');
    expect(selectedRowId()).toBe('u2');
    await user.keyboard('{ArrowUp}');
    expect(selectedRowId()).toBe('t1');
    expect(document.activeElement).toBe(search);

    // At the top of the list the highlight stays put rather than wrapping.
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');
    expect(selectedRowId()).toBe('u1');
    await user.keyboard('{ArrowDown}');
    expect(selectedRowId()).toBe('a1');
  });

  it('puts the keyboard on the first row of a kind filter', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    // No query, so there is no match to land on: the first row of what is left.
    await user.click(screen.getByRole('button', { name: 'Assistant' }));

    expect(rowIds()).toEqual(['a1', 'a2', 'a3']);
    expect(selectedRowId()).toBe('a1');
  });

  it('moves the session to the row the arrow keys picked', async () => {
    const onSelect = vi.fn();
    await renderDialog({ onSelect, onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Search this session'), 'attempt');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('u2');
  });

  it('does not paint a keyboard row before anything is searched', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });

    expect(selectedRowId()).toBeNull();
  });

  it('moves the session to the row that was clicked', async () => {
    const onSelect = vi.fn();
    await renderDialog({ onSelect, onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.click(row('a2'));

    expect(onSelect).toHaveBeenCalledWith('a2');
  });

  it('folds and unfolds a fork with the arrow keys', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.click(row('u2'));
    await user.keyboard('{ArrowLeft}');
    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2']);

    await user.keyboard('{ArrowRight}');
    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3']);
  });

  it('moves the tree cursor with the arrow keys', async () => {
    fake.tree = singleTreeSession();
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.click(row('u1'));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(row('a1')));

    await user.keyboard('{End}');
    await waitFor(() => expect(document.activeElement).toBe(row('a3')));

    await user.keyboard('{Home}');
    await waitFor(() => expect(document.activeElement).toBe(row('u1')));
  });

  it('moves the cursor to the last row on screen, not into a folded tree', async () => {
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.click(row('u1'));
    await user.keyboard('{End}');

    await waitFor(() => expect(document.activeElement).toBe(row('a3')));
  });

  it('steps back to the row a row hangs from when it has nothing to fold', async () => {
    fake.tree = singleTreeSession();
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    await user.click(row('a3'));
    await user.keyboard('{ArrowLeft}');

    await waitFor(() => expect(document.activeElement).toBe(row('u2')));
    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3']);
  });

  it('keeps the folds through a refresh, and shows the rows it brought', async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <SessionTreeDialog
        open
        onOpenChange={onOpenChange}
        sessionPath={SESSION_PATH}
        revision="1"
        onSelect={onSelect}
      />,
    );
    await screen.findAllByTestId('session-tree-row');
    const user = userEvent.setup();

    await user.click(row('u2'));
    await user.keyboard('{ArrowLeft}');
    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2']);

    // The session grows: a fourth message lands under `u2`.
    fake.tree = sessionTree(
      [...dialogTree().entries, sessionTreeEntry(9, 'a4', 'u2', 'assistant', 'Third attempt')],
      'a4',
    );
    rerender(
      <SessionTreeDialog
        open
        onOpenChange={onOpenChange}
        sessionPath={SESSION_PATH}
        revision="2"
        onSelect={onSelect}
      />,
    );
    await waitFor(() =>
      expect(fake.commands.filter((c) => c.type === 'get_session_tree')).toHaveLength(2),
    );

    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2']);

    await user.keyboard('{ArrowRight}');
    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3', 'a4']);
  });

  it('starts the next visit fresh when the caller closes it after a pick', async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    const dialog = (open: boolean): React.JSX.Element => (
      <SessionTreeDialog
        open={open}
        onOpenChange={onOpenChange}
        sessionPath={SESSION_PATH}
        revision="1"
        onSelect={onSelect}
      />
    );
    const { rerender } = render(dialog(true));
    await screen.findAllByTestId('session-tree-row');
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Search this session'), 'echo');
    expect(rowIds()).toEqual(['u1', 'a1', 't1']);

    // A pick closes the dialog from outside: Radix reports no change of its own.
    rerender(dialog(false));
    rerender(dialog(true));
    await screen.findAllByTestId('session-tree-row');

    expect(screen.getByPlaceholderText('Search this session')).toHaveValue('');
    expect(rowIds()).toEqual(['u1', 'a1', 't1', 'u2', 'a2', 'c1', 'a3']);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  /**
   * A conversation is one level deeper per message, so a long one is deeper than
   * the call stack: any recursive walk over the rows — ours or a library's — takes
   * the renderer down on open (a white window, `Maximum call stack size
   * exceeded`). Mounted, not only the layout functions, so the whole path to the
   * screen is covered.
   */
  it('opens on a straight conversation of 20000 messages', async () => {
    const LENGTH = 20_000;
    const entries = Array.from({ length: LENGTH }, (_, index) =>
      sessionTreeEntry(
        index,
        `m${index}`,
        index === 0 ? null : `m${index - 1}`,
        index % 2 === 0 ? 'user' : 'assistant',
        `message ${index}`,
      ),
    );
    fake.tree = sessionTree(entries, `m${LENGTH - 1}`);
    await renderDialog({ onSelect: vi.fn(), onOpenChange: vi.fn() });
    const user = userEvent.setup();

    // jsdom cannot scroll, so the window stays at the top; the browser layer
    // covers opening at the end and reaching both ends.
    await user.click(row('m0'));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(row('m1')));
  }, 20_000);
});
