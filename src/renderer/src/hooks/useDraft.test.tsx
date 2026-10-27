// @vitest-environment jsdom
/**
 * The contract of a draft field: typing is free, an external change resets, and
 * a reset seen while the user is mid-edit must not be dropped. The reset is a
 * render-time adjustment rather than an effect, so these assertions run without
 * flush helpers.
 */
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useDraft } from './useDraft';

afterEach(cleanup);

/** A field with the same external input a settings row has. */
function DraftField({
  source,
  onEdit,
}: {
  source: string;
  onEdit?: (draft: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useDraft(source, (next) => next);
  return (
    <input
      aria-label="draft"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onEdit?.(event.target.value);
      }}
    />
  );
}

function field(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement;
}

describe('useDraft', () => {
  it('keeps what the user typed while the external value stays the same', () => {
    const { rerender } = render(<DraftField source="saved" />);
    fireEvent.change(field(), { target: { value: 'half-typed' } });
    expect(field().value).toBe('half-typed');

    // The parent re-renders for its own reasons (a snapshot arriving, a save of
    // another field); the string is identical, so nothing may be reset.
    rerender(<DraftField source="saved" />);
    expect(field().value).toBe('half-typed');
  });

  it('resets to a value that changed from outside', () => {
    const { rerender } = render(<DraftField source="saved" />);
    fireEvent.change(field(), { target: { value: 'typing' } });

    rerender(<DraftField source="replaced" />);
    expect(field().value).toBe('replaced');
  });

  it('resets an in-progress edit when the value changes externally mid-edit', () => {
    // The class of bug this hook removes: one copy forgot the reset, another
    // reset on every render. A save that lands while the field is being edited
    // has to win.
    const { rerender } = render(<DraftField source="1" />);
    fireEvent.change(field(), { target: { value: '12' } });

    rerender(<DraftField source="120" />);
    expect(field().value).toBe('120');

    fireEvent.change(field(), { target: { value: '1200' } });
    rerender(<DraftField source="1200-saved" />);
    expect(field().value).toBe('1200-saved');
  });

  it('compares by content when the source is a fresh array each time', () => {
    function ListField({ entries }: { entries: readonly string[] }): React.JSX.Element {
      const [draft, setDraft] = useDraft(JSON.stringify(entries), (key) => key);
      return (
        <input
          aria-label="list-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          data-entries={entries.join(',')}
        />
      );
    }
    const { rerender } = render(<ListField entries={['one', 'two']} />);
    const input = (): HTMLInputElement => screen.getByLabelText('list-draft');
    fireEvent.change(input(), { target: { value: 'in-progress' } });

    // A new array with the same content: the JSON key matches, so the draft is
    // left alone even though the reference changed.
    rerender(<ListField entries={['one', 'two']} />);
    expect(input().value).toBe('in-progress');

    rerender(<ListField entries={['one', 'two', 'three']} />);
    expect(input().value).toBe('["one","two","three"]');
  });

  it('hands the previous draft to the reset so row identity can survive', () => {
    const seen: Array<string | undefined> = [];
    function DerivedField({ source }: { source: string }): React.JSX.Element {
      const [draft] = useDraft<string, string>(source, (next, previous) => {
        seen.push(previous);
        return `${next}:${previous ?? 'fresh'}`;
      });
      return <span>{draft}</span>;
    }
    const { rerender } = render(<DerivedField source="a" />);
    expect(screen.getByText('a:fresh')).toBeDefined();

    rerender(<DerivedField source="b" />);
    expect(screen.getByText('b:a:fresh')).toBeDefined();
  });

  it('does not reset the draft to the source on every render', () => {
    // A reset-on-render implementation (setDraft(derive(source)) unconditionally)
    // would clamp the caret back on each keystroke; the value proves it does not.
    function CountingField(): React.JSX.Element {
      const [source] = useState('saved');
      const [draft, setDraft] = useDraft(source, (next) => next);
      return (
        <input
          aria-label="counting"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          data-source={source}
        />
      );
    }
    render(<CountingField />);
    const input = (): HTMLInputElement => screen.getByLabelText('counting');
    fireEvent.change(input(), { target: { value: 'a' } });
    fireEvent.change(input(), { target: { value: 'ab' } });
    fireEvent.change(input(), { target: { value: 'abc' } });
    expect(input().value).toBe('abc');
  });
});
