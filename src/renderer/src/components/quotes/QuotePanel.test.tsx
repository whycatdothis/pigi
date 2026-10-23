// @vitest-environment jsdom
import '../../testing/jsdomSetup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(onSend).toHaveBeenCalledWith('Comments on quoted passages:\n1.\n> quoted');
  });

  it('ignores the shortcut while the sidebar is closed or on a plain Enter', () => {
    const onSend = renderPanel();
    fireEvent.keyDown(window, { key: 'Enter' });
    useAppStore.setState({ openRightSidebarSessions: new Map() });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});
