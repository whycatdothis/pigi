// @vitest-environment jsdom
/**
 * `StringListField` is edited in place, so its rows have to keep their identity:
 * an id reissued on commit remounts the input, and a commit happens on Enter
 * from inside the field that would then lose the caret.
 *
 * `NumberField` without `commitWhileTyping` writes a file per commit, so typing
 * must wait for blur, and an empty field ("default") must not step down to 0.
 */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { NumberField, StringListField } from './settingsControls';

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

describe('NumberField', () => {
  it('commits typing on blur, not per keystroke', () => {
    const onChange = vi.fn();
    render(<NumberField value={2000} label="Delay" step={1000} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Delay' });

    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.change(input, { target: { value: '60' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(60);
  });

  it('does not step an empty field down to the minimum', () => {
    const onChange = vi.fn();
    render(<NumberField value={undefined} label="Timeout" step={1000} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Timeout' }), { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Decrease Timeout' })).toHaveProperty(
      'disabled',
      true,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase Timeout' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1000);
  });
});
