// @vitest-environment jsdom
/**
 * `StringListField` is edited in place, so its rows have to keep their identity:
 * an id reissued on commit remounts the input, and a commit happens on Enter
 * from inside the field that would then lose the caret.
 */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { StringListField } from './settingsControls';

afterEach(cleanup);

describe('StringListField', () => {
  it('keeps the caret in the field that committed on Enter', () => {
    render(<StringListField value={['one', 'two']} onCommit={() => {}} addLabel="Add" />);
    const fields = screen.getAllByRole('textbox');
    const second = fields[1] as HTMLInputElement;

    second.focus();
    fireEvent.keyDown(second, { key: 'Enter' });

    expect(document.activeElement).toBe(second);
    expect(screen.getAllByRole('textbox')[1]).toBe(second);
  });

  it('reuses row identity when the saved value comes back', () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <StringListField value={['one', 'two']} onCommit={onCommit} addLabel="Add" />,
    );
    const before = screen.getAllByRole('textbox');

    fireEvent.change(before[0] as HTMLInputElement, { target: { value: 'uno' } });
    fireEvent.keyDown(before[0] as HTMLInputElement, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith(['uno', 'two']);

    // What the parent does with the write result: the same list, a new array.
    rerender(<StringListField value={['uno', 'two']} onCommit={onCommit} addLabel="Add" />);

    const after = screen.getAllByRole('textbox');
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it('drops a removed row without renumbering the ones below it', () => {
    const onCommit = vi.fn();
    render(<StringListField value={['one', 'two', 'three']} onCommit={onCommit} addLabel="Add" />);
    const fields = screen.getAllByRole('textbox');
    const third = fields[2];

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove entry' })[1] as HTMLElement);

    expect(onCommit).toHaveBeenLastCalledWith(['one', 'three']);
    expect(screen.getAllByRole('textbox')[1]).toBe(third);
  });
});
