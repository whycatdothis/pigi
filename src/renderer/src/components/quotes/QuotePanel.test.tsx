// @vitest-environment jsdom
import '../../testing/jsdomSetup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../state/appStore';
import QuotePanel from './QuotePanel';

const SESSION_PATH = '/tmp/sessions/quotes.jsonl';
const SEND_SHORTCUT = { key: 'Enter', meta: true };

function renderPanel(): ReturnType<typeof vi.fn<(message: string) => Promise<void>>> {
  const onSend = vi.fn<(message: string) => Promise<void>>().mockResolvedValue(undefined);
  render(<QuotePanel sessionPath={SESSION_PATH} onSend={onSend} sendShortcut={SEND_SHORTCUT} />);
  return onSend;
}

describe('QuotePanel send shortcut', () => {
  beforeEach(() => {
    useAppStore.setState({
      quotesBySession: new Map([[SESSION_PATH, [{ id: 'a', text: 'quoted', comment: '' }]]]),
      openRightSidebarSessions: new Map([[SESSION_PATH, true]]),
      globalCommentBySession: new Map(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the shortcut on Send and sends the quotes while the sidebar is open', () => {
    useAppStore.setState({ platform: 'mac' });
    const onSend = renderPanel();
    const sendButton = screen.getByRole('button', { name: /^Send/ });
    expect(sendButton).toHaveTextContent('Send⌘');
    expect(within(sendButton).getByLabelText('Enter')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSend).toHaveBeenCalledWith('Comments on quoted passages:\n1. > quoted');
  });

  it('adds a global comment from the plus and sends it after the quotes', () => {
    const onSend = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Add global comment' }));
    const editor = screen.getByRole('textbox', { name: 'Quote comment' });
    fireEvent.change(editor, { target: { value: 'Overall fine.' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(screen.getByText('Overall fine.')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSend).toHaveBeenCalledWith(
      'Comments on quoted passages:\n1. > quoted\nGlobal comment:\nOverall fine.',
    );
    expect(useAppStore.getState().globalCommentBySession.has(SESSION_PATH)).toBe(false);
  });

  it('keeps the global comment sendable after the last quote is deleted', () => {
    useAppStore.setState({ globalCommentBySession: new Map([[SESSION_PATH, 'Overall fine.']]) });
    const onSend = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Delete quote' }));
    expect(screen.getByText('Overall fine.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Send/ }));
    expect(onSend).toHaveBeenCalledWith('Global comment:\nOverall fine.');
  });

  it('sends quotes added after the panel mounted', () => {
    // The shortcut handler is registered once, so it must read the current
    // quotes rather than the empty list the panel mounted with.
    useAppStore.setState({ quotesBySession: new Map(), openRightSidebarSessions: new Map() });
    const onSend = renderPanel();
    act(() => {
      useAppStore.setState({
        quotesBySession: new Map([[SESSION_PATH, [{ id: 'a', text: 'quoted', comment: '' }]]]),
        openRightSidebarSessions: new Map([[SESSION_PATH, true]]),
      });
    });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSend).toHaveBeenCalledWith('Comments on quoted passages:\n1. > quoted');
  });

  it('ignores the shortcut while the sidebar is closed or on a plain Enter', () => {
    const onSend = renderPanel();
    fireEvent.keyDown(window, { key: 'Enter' });
    useAppStore.setState({ openRightSidebarSessions: new Map() });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});
