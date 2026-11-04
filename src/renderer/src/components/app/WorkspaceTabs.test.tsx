// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../testing/jsdomSetup';
import WorkspaceTabs from './WorkspaceTabs';

afterEach(cleanup);

describe('WorkspaceTabs', () => {
  it("shows the agent's activity on the Chat tab only while another tab is open", () => {
    const props = { onChange: vi.fn(), shortcutBindings: null, chatTitle: 'Chat' };
    const { rerender } = render(<WorkspaceTabs {...props} value="files" chatActivity="running" />);
    expect(screen.getByLabelText('Running')).toBeInTheDocument();

    rerender(<WorkspaceTabs {...props} value="git" chatActivity="unread" />);
    expect(screen.queryByLabelText('Running')).toBeNull();
    expect(screen.getByRole('status', { name: 'Finished' })).toBeInTheDocument();

    rerender(<WorkspaceTabs {...props} value="chat" chatActivity="running" />);
    expect(screen.queryByLabelText('Running')).toBeNull();
  });

  it('renames the chat from a double-click on the Chat tab', () => {
    const onRenameChat = vi.fn();
    render(
      <WorkspaceTabs
        value="chat"
        onChange={vi.fn()}
        shortcutBindings={null}
        chatTitle="Old title"
        chatRenameTitle="Old title"
        onRenameChat={onRenameChat}
      />,
    );

    const tab = screen.getByRole('tab', { name: 'Old title tab' });
    expect(tab).toHaveAttribute('title', 'Old title');
    expect(screen.getByRole('tab', { name: 'Files tab' })).not.toHaveAttribute('title');
    fireEvent.doubleClick(tab);
    const input = screen.getByRole('textbox', { name: 'Rename chat' });
    expect(input).toHaveValue('Old title');

    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameChat).toHaveBeenCalledWith('New title');
    expect(screen.queryByRole('textbox', { name: 'Rename chat' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Old title tab' })).toHaveFocus();
  });

  it('keeps the draft while the typewriter title changes', () => {
    const { rerender } = render(
      <WorkspaceTabs
        value="chat"
        onChange={vi.fn()}
        shortcutBindings={null}
        chatTitle="Old title"
        chatRenameTitle="Old title"
        onRenameChat={vi.fn()}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Old title tab' }));
    rerender(
      <WorkspaceTabs
        value="chat"
        onChange={vi.fn()}
        shortcutBindings={null}
        chatTitle="Old title is typing"
        chatRenameTitle="Old title"
        onRenameChat={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Rename chat' })).toHaveValue('Old title');
  });

  it('does not pull focus back after a blur commit', () => {
    render(
      <>
        <WorkspaceTabs
          value="chat"
          onChange={vi.fn()}
          shortcutBindings={null}
          chatTitle="Old title"
          onRenameChat={vi.fn()}
        />
        <button type="button">Other</button>
      </>,
    );

    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Old title tab' }));
    const other = screen.getByRole('button', { name: 'Other' });
    act(() => other.focus());

    expect(other).toHaveFocus();
    expect(screen.queryByRole('textbox', { name: 'Rename chat' })).toBeNull();
  });

  it('leaves the title unchanged on Escape', () => {
    const onRenameChat = vi.fn();
    render(
      <WorkspaceTabs
        value="chat"
        onChange={vi.fn()}
        shortcutBindings={null}
        chatTitle="Old title"
        onRenameChat={onRenameChat}
      />,
    );

    const tab = screen.getByRole('tab', { name: 'Old title tab' });
    fireEvent.doubleClick(tab);
    const input = screen.getByRole('textbox', { name: 'Rename chat' });
    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRenameChat).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Rename chat' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Old title tab' })).toHaveFocus();
  });
});
